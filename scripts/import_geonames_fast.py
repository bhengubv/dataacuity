#!/usr/bin/env python3
"""
Fast GeoNames import using PostgreSQL COPY command.
Imports ALL data with optimizations:
- COPY command for bulk insert (10x faster than INSERT)
- Index deferral (disable during import, rebuild after)
- Progress estimation with ETA
- Batch processing with temp files
"""

import os
import sys
import json
import uuid
import logging
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
import psycopg2
from psycopg2 import sql

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/geektrading/maps/data/geonames/import_fast.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://maps:maps_secret_2024@localhost:5433/maps'
)

PROGRESS_FILE = '/home/geektrading/maps/data/geonames/import_fast_progress.json'
GEONAMES_FILE = '/home/geektrading/maps/data/geonames/allCountries.txt'
BATCH_SIZE = 50000  # Larger batches for COPY

# Feature code to place_type mapping
FEATURE_CODE_MAPPING = {
    'PPL': 'settlement', 'PPLA': 'settlement', 'PPLA2': 'settlement',
    'PPLA3': 'settlement', 'PPLA4': 'settlement', 'PPLC': 'capital',
    'PPLG': 'settlement', 'PPLL': 'locality', 'PPLQ': 'settlement-abandoned',
    'PPLR': 'settlement-religious', 'PPLS': 'settlement', 'PPLW': 'settlement',
    'PPLX': 'neighborhood', 'HTL': 'hotel', 'HTLM': 'motel', 'RSRT': 'resort',
    'SCH': 'school', 'SCHC': 'college', 'HSP': 'hospital', 'HSPC': 'clinic',
    'AIRP': 'airport', 'AIRF': 'airfield', 'RSTN': 'train-station',
    'BUSTN': 'bus-station', 'MT': 'mountain', 'MTS': 'mountain-range',
    'PK': 'peak', 'LK': 'lake', 'STM': 'river', 'ISL': 'island',
    'ADM1': 'admin-region', 'ADM2': 'admin-district', 'PCLI': 'country',
}

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {'imported_count': 0, 'last_line': 0, 'errors': 0, 'completed': False, 'start_time': None}

def save_progress(progress):
    progress['last_import_time'] = datetime.now().isoformat()
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

def get_total_lines():
    """Count total lines in file for progress estimation."""
    with open(GEONAMES_FILE, 'rb') as f:
        return sum(1 for _ in f)

def parse_line(line):
    """Parse a GeoNames tab-separated line."""
    parts = line.strip().split('\t')
    if len(parts) < 19:
        return None

    try:
        geonameid = parts[0]
        name = parts[1].replace('\\', '\\\\').replace('\t', ' ').replace('\n', ' ')
        asciiname = parts[2].replace('\\', '\\\\').replace('\t', ' ').replace('\n', ' ') if parts[2] else ''
        alternatenames = parts[3][:500].replace('\\', '\\\\').replace('\t', ' ').replace('\n', ' ') if parts[3] else ''
        latitude = parts[4]
        longitude = parts[5]
        feature_class = parts[6]
        feature_code = parts[7]
        country_code = parts[8] if parts[8] else ''
        raw_admin1 = parts[10] if len(parts) > 10 and parts[10] else ''
        raw_admin2 = parts[11] if len(parts) > 11 and parts[11] else ''
        population = parts[14] if parts[14] else ''

        if not latitude or not longitude:
            return None

        # Build admin codes
        admin1_code = f"{country_code}.{raw_admin1}" if country_code and raw_admin1 else ''
        admin2_code = f"{country_code}.{raw_admin1}.{raw_admin2}" if country_code and raw_admin1 and raw_admin2 else ''

        # Get place_type
        place_type = FEATURE_CODE_MAPPING.get(feature_code, feature_class.lower() if feature_class else 'unknown')

        return {
            'uuid': str(uuid.uuid4()),
            'geonameid': geonameid,
            'name': name,
            'asciiname': asciiname,
            'alternatenames': alternatenames,
            'latitude': latitude,
            'longitude': longitude,
            'feature_class': feature_class,
            'feature_code': feature_code,
            'country_code': country_code,
            'admin1_code': admin1_code,
            'admin2_code': admin2_code,
            'population': population,
            'place_type': place_type,
        }
    except Exception as e:
        return None

def disable_indexes(conn):
    """Disable indexes for faster import."""
    logger.info("Disabling indexes...")
    cursor = conn.cursor()
    # Drop non-essential indexes (keep primary key and unique constraints)
    cursor.execute("DROP INDEX IF EXISTS idx_places_geometry")
    cursor.execute("DROP INDEX IF EXISTS idx_places_name_trgm")
    conn.commit()
    cursor.close()
    logger.info("Indexes disabled")

def rebuild_indexes(conn):
    """Rebuild indexes after import."""
    logger.info("Rebuilding indexes...")
    cursor = conn.cursor()
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_places_geometry ON places USING gist(geometry)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_places_name_trgm ON places USING gin(current_name gin_trgm_ops)")
    cursor.execute("ANALYZE places")
    conn.commit()
    cursor.close()
    logger.info("Indexes rebuilt")

def import_batch_copy(conn, batch):
    """Import batch using COPY command via temp file."""
    if not batch:
        return 0

    cursor = conn.cursor()

    # Create temp table
    cursor.execute("""
        CREATE TEMP TABLE IF NOT EXISTS temp_places (
            uuid UUID,
            current_name VARCHAR(255),
            ascii_name VARCHAR(255),
            alternate_names TEXT,
            place_type VARCHAR(50),
            feature_class VARCHAR(5),
            feature_code VARCHAR(10),
            country_code VARCHAR(3),
            admin1_code VARCHAR(50),
            admin2_code VARCHAR(80),
            longitude FLOAT,
            latitude FLOAT,
            population BIGINT,
            source VARCHAR(50),
            source_id VARCHAR(100)
        ) ON COMMIT DROP
    """)

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.tsv', delete=False) as f:
        for place in batch:
            pop = place['population'] if place['population'] else '\\N'
            line = '\t'.join([
                place['uuid'],
                place['name'],
                place['asciiname'],
                place['alternatenames'],
                place['place_type'],
                place['feature_class'],
                place['feature_code'],
                place['country_code'],
                place['admin1_code'],
                place['admin2_code'],
                place['longitude'],
                place['latitude'],
                pop,
                'geonames',
                place['geonameid']
            ])
            f.write(line + '\n')
        temp_file = f.name

    # COPY to temp table
    with open(temp_file, 'r') as f:
        cursor.copy_from(f, 'temp_places', columns=[
            'uuid', 'current_name', 'ascii_name', 'alternate_names', 'place_type',
            'feature_class', 'feature_code', 'country_code', 'admin1_code', 'admin2_code',
            'longitude', 'latitude', 'population', 'source', 'source_id'
        ])

    os.unlink(temp_file)

    # Upsert from temp table
    cursor.execute("""
        INSERT INTO places (uuid, current_name, ascii_name, alternate_names, place_type,
                           feature_class, feature_code, country_code, admin1_code, admin2_code,
                           geometry, population, source, source_id)
        SELECT uuid, current_name, ascii_name, alternate_names, place_type,
               feature_class, feature_code, country_code, admin1_code, admin2_code,
               ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), population, source, source_id
        FROM temp_places
        ON CONFLICT (source, source_id) DO UPDATE SET
            current_name = EXCLUDED.current_name,
            ascii_name = EXCLUDED.ascii_name,
            alternate_names = EXCLUDED.alternate_names,
            place_type = EXCLUDED.place_type,
            feature_class = EXCLUDED.feature_class,
            feature_code = EXCLUDED.feature_code,
            country_code = EXCLUDED.country_code,
            admin1_code = EXCLUDED.admin1_code,
            admin2_code = EXCLUDED.admin2_code,
            geometry = EXCLUDED.geometry,
            population = EXCLUDED.population,
            updated_at = NOW()
    """)

    imported = cursor.rowcount
    conn.commit()
    cursor.close()
    return len(batch)

def format_eta(seconds):
    """Format seconds into human-readable time."""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        return f"{int(seconds/60)}m {int(seconds%60)}s"
    else:
        return f"{int(seconds/3600)}h {int((seconds%3600)/60)}m"

def main():
    if not os.path.exists(GEONAMES_FILE):
        logger.error(f"GeoNames file not found: {GEONAMES_FILE}")
        sys.exit(1)

    progress = load_progress()
    if progress['completed']:
        logger.info("Import already completed. Delete progress file to re-import.")
        sys.exit(0)

    # Get total lines for progress
    logger.info("Counting total lines...")
    total_lines = get_total_lines()
    logger.info(f"Total lines: {total_lines:,}")

    conn = psycopg2.connect(DATABASE_URL)

    # Disable indexes for speed
    disable_indexes(conn)

    logger.info(f"Starting fast import from line {progress['last_line']:,}")

    batch = []
    total_imported = progress['imported_count']
    start_time = time.time()
    start_line = progress['last_line']

    with open(GEONAMES_FILE, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            if line_num <= progress['last_line']:
                continue

            place = parse_line(line)
            if place:
                batch.append(place)

            if len(batch) >= BATCH_SIZE:
                imported = import_batch_copy(conn, batch)
                total_imported += imported

                # Calculate ETA
                elapsed = time.time() - start_time
                lines_processed = line_num - start_line
                rate = lines_processed / elapsed if elapsed > 0 else 0
                remaining_lines = total_lines - line_num
                eta_seconds = remaining_lines / rate if rate > 0 else 0

                progress['imported_count'] = total_imported
                progress['last_line'] = line_num
                save_progress(progress)

                pct = (line_num / total_lines) * 100
                logger.info(f"Line {line_num:,}/{total_lines:,} ({pct:.1f}%) | {total_imported:,} places | {rate:.0f} lines/s | ETA: {format_eta(eta_seconds)}")
                batch = []

    # Final batch
    if batch:
        imported = import_batch_copy(conn, batch)
        total_imported += imported
        progress['imported_count'] = total_imported
        progress['last_line'] = line_num

    # Rebuild indexes
    rebuild_indexes(conn)

    progress['completed'] = True
    save_progress(progress)

    conn.close()

    total_time = time.time() - start_time
    logger.info("=" * 50)
    logger.info("IMPORT COMPLETED!")
    logger.info(f"Total places: {total_imported:,}")
    logger.info(f"Total time: {format_eta(total_time)}")
    logger.info(f"Average rate: {total_imported/total_time:.0f} places/sec")

if __name__ == '__main__':
    main()
