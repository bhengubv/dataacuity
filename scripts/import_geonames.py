#!/usr/bin/env python3
"""
Import GeoNames data into the maps database.
Focuses on practical/business-useful place types.

GeoNames format (tab-separated):
0: geonameid
1: name
2: asciiname
3: alternatenames
4: latitude
5: longitude
6: feature_class
7: feature_code
8: country_code
9: cc2
10: admin1_code
11: admin2_code
12: admin3_code
13: admin4_code
14: population
15: elevation
16: dem
17: timezone
18: modification_date
"""

import os
import sys
import json
import uuid
import logging
from datetime import datetime
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_batch

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/geektrading/maps/data/geonames/import.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Database connection - requires DATABASE_URL environment variable
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    logger.error("DATABASE_URL environment variable is required")
    sys.exit(1)

# Feature classes and codes to import
# P = populated places (all)
# S = spot features (selected useful ones)
# A = administrative (selected)
# T = terrain (major only)
# H = hydro (major only)

USEFUL_FEATURE_CODES = {
    # Populated places - all
    'P': None,  # All P class

    # Spot features - business relevant
    'S': {
        'HTL',   # Hotels
        'HTLM',  # Motels
        'SCH',   # Schools
        'SCHA',  # Agricultural schools
        'SCHC',  # Colleges
        'SCHM',  # Military schools
        'SCHN',  # Maritime schools
        'SCHT',  # Technical schools
        'HSP',   # Hospitals
        'HSPC',  # Clinics
        'HSPD',  # Dispensaries
        'AIRP',  # Airports
        'AIRF',  # Airfields
        'AIRH',  # Heliports
        'BUSTN', # Bus stations
        'BUSTP', # Bus stops
        'RSTN',  # Railroad stations
        'RSTNE', # Metro stations
        'RSTP',  # Railroad stops
        'PO',    # Post offices
        'MALL',  # Shopping malls
        'MKT',   # Markets
        'LIBR',  # Libraries
        'MUS',   # Museums
        'THTR',  # Theaters
        'ZOO',   # Zoos
        'STDM',  # Stadiums
        'RECG',  # Golf courses
        'RECR',  # Racetracks
        'PRK',   # Parks
        'AMUS',  # Amusement parks
        'CSTM',  # Customs houses
        'GOVL',  # Local government offices
        'ADMF',  # Administrative facilities
        'PP',    # Police posts
        'PSTB',  # Border posts
        'FIRE',  # Fire stations
        'REST',  # Restaurants
        'CAFE',  # Cafes
        'BAR',   # Bars
        'ATM',   # ATMs
        'BANK',  # Banks
        'FUEL',  # Gas stations
        'WHRF',  # Wharves
        'PIER',  # Piers
        'MAR',   # Marinas
        'CTRR',  # Religious retreats
        'CMTY',  # Cemeteries
        'CH',    # Churches
        'MSQE',  # Mosques
        'TMPL',  # Temples
        'SNTR',  # Sanatoriums
        'SPA',   # Spas
        'RSRT',  # Resorts
        'LDNG',  # Landings
        'FY',    # Ferries
        'TOLL',  # Toll gates
        'PKLT',  # Parking lots
    },

    # Administrative - regions and capitals
    'A': {
        'ADM1',  # First-order admin (states/provinces)
        'ADM2',  # Second-order admin (counties/districts)
        'PCLI',  # Independent political entity
        'PCLD',  # Dependent political entity
    },

    # Terrain - major features only
    'T': {
        'MT',    # Mountains
        'MTS',   # Mountain ranges
        'PK',    # Peaks
        'CAPE',  # Capes
        'ISL',   # Islands
        'ISLS',  # Island groups
        'PEN',   # Peninsulas
        'PASS',  # Mountain passes
    },

    # Hydro - major features only
    'H': {
        'LK',    # Lakes
        'LKS',   # Lake systems
        'RSV',   # Reservoirs
        'STM',   # Streams (major rivers only via population filter)
        'STMS',  # Stream systems
        'BAY',   # Bays
        'GULF',  # Gulfs
        'HBR',   # Harbors
        'OCN',   # Oceans
        'SEA',   # Seas
    },
}

# Map GeoNames feature codes to our place_type
FEATURE_CODE_MAPPING = {
    # Populated places
    'PPL': 'settlement',
    'PPLA': 'settlement',  # Capital of admin1
    'PPLA2': 'settlement', # Capital of admin2
    'PPLA3': 'settlement',
    'PPLA4': 'settlement',
    'PPLC': 'capital',     # Country capital
    'PPLG': 'settlement',  # Seat of government
    'PPLL': 'locality',
    'PPLQ': 'settlement-abandoned',
    'PPLR': 'settlement-religious',
    'PPLS': 'settlement',
    'PPLW': 'settlement',
    'PPLX': 'neighborhood',

    # Accommodations
    'HTL': 'hotel',
    'HTLM': 'motel',
    'RSRT': 'resort',
    'SPA': 'spa',

    # Education
    'SCH': 'school',
    'SCHA': 'school',
    'SCHC': 'college',
    'SCHM': 'school',
    'SCHN': 'school',
    'SCHT': 'school',
    'LIBR': 'library',
    'MUS': 'museum',

    # Healthcare
    'HSP': 'hospital',
    'HSPC': 'clinic',
    'HSPD': 'clinic',
    'SNTR': 'hospital',

    # Transport
    'AIRP': 'airport',
    'AIRF': 'airfield',
    'AIRH': 'heliport',
    'BUSTN': 'bus-station',
    'BUSTP': 'bus-stop',
    'RSTN': 'train-station',
    'RSTNE': 'metro-station',
    'RSTP': 'train-stop',
    'WHRF': 'wharf',
    'PIER': 'pier',
    'MAR': 'marina',
    'FY': 'ferry',
    'TOLL': 'toll-gate',
    'PKLT': 'parking',
    'FUEL': 'fuel-station',

    # Commerce
    'PO': 'post-office',
    'MALL': 'shopping-mall',
    'MKT': 'market',
    'BANK': 'bank',
    'ATM': 'atm',
    'REST': 'restaurant',
    'CAFE': 'cafe',
    'BAR': 'bar',

    # Government/Emergency
    'GOVL': 'government',
    'ADMF': 'government',
    'PP': 'police-station',
    'PSTB': 'border-post',
    'FIRE': 'fire-station',
    'CSTM': 'customs',

    # Recreation
    'THTR': 'theater',
    'ZOO': 'zoo',
    'STDM': 'stadium',
    'RECG': 'golf-course',
    'RECR': 'racetrack',
    'PRK': 'park',
    'AMUS': 'amusement-park',

    # Religious
    'CH': 'church',
    'MSQE': 'mosque',
    'TMPL': 'temple',
    'CTRR': 'retreat',
    'CMTY': 'cemetery',

    # Administrative
    'ADM1': 'admin-region',
    'ADM2': 'admin-district',
    'PCLI': 'country',
    'PCLD': 'territory',

    # Terrain
    'MT': 'mountain',
    'MTS': 'mountain-range',
    'PK': 'peak',
    'CAPE': 'cape',
    'ISL': 'island',
    'ISLS': 'islands',
    'PEN': 'peninsula',
    'PASS': 'mountain-pass',

    # Water
    'LK': 'lake',
    'LKS': 'lakes',
    'RSV': 'reservoir',
    'STM': 'river',
    'STMS': 'river-system',
    'BAY': 'bay',
    'GULF': 'gulf',
    'HBR': 'harbor',
    'OCN': 'ocean',
    'SEA': 'sea',
}

PROGRESS_FILE = '/home/geektrading/maps/data/geonames/import_progress.json'

def load_progress():
    """Load import progress from file."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {
        'imported_count': 0,
        'last_line': 0,  # Use line number instead of geonameid
        'errors': 0,
        'completed': False
    }

def save_progress(progress):
    """Save import progress to file."""
    progress['last_import_time'] = datetime.now().isoformat()
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

def should_import(feature_class, feature_code, population):
    """Import ALL places - no filtering."""
    # Import everything for comprehensive commercial dataset
    return True

def parse_line(line):
    """Parse a GeoNames tab-separated line."""
    parts = line.strip().split('\t')
    if len(parts) < 19:
        return None

    try:
        geonameid = int(parts[0])
        name = parts[1]
        asciiname = parts[2]
        alternatenames = parts[3].split(',') if parts[3] else []
        latitude = float(parts[4]) if parts[4] else None
        longitude = float(parts[5]) if parts[5] else None
        feature_class = parts[6]
        feature_code = parts[7]
        country_code = parts[8] if parts[8] else None
        raw_admin1 = parts[10] if len(parts) > 10 and parts[10] else None
        raw_admin2 = parts[11] if len(parts) > 11 and parts[11] else None
        population = int(parts[14]) if parts[14] else 0

        if latitude is None or longitude is None:
            return None

        # Build admin codes in lookup table format
        admin1_code = f"{country_code}.{raw_admin1}" if country_code and raw_admin1 else None
        admin2_code = f"{country_code}.{raw_admin1}.{raw_admin2}" if country_code and raw_admin1 and raw_admin2 else None

        return {
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
        }
    except (ValueError, IndexError) as e:
        return None

def import_batch(conn, places):
    """Import a batch of places into the database."""
    if not places:
        return 0

    cursor = conn.cursor()

    insert_sql = """
        INSERT INTO places (uuid, current_name, ascii_name, alternate_names, place_type, feature_class, feature_code,
                           country_code, admin1_code, admin2_code, geometry, population, source, source_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s)
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
        RETURNING id
    """

    imported = 0
    for place in places:
        try:
            place_type = FEATURE_CODE_MAPPING.get(
                place['feature_code'],
                place['feature_class'].lower()
            )

            # Join alternate names with pipe separator for storage
            alt_names = '|'.join(place.get('alternatenames', [])[:50]) if place.get('alternatenames') else None

            cursor.execute(insert_sql, (
                str(uuid.uuid4()),
                place['name'],
                place.get('asciiname'),
                alt_names,
                place_type,
                place['feature_class'],
                place['feature_code'],
                place['country_code'],
                place.get('admin1_code'),
                place.get('admin2_code'),
                place['longitude'],
                place['latitude'],
                place['population'] if place['population'] > 0 else None,
                'geonames',
                str(place['geonameid'])
            ))
            imported += 1
        except Exception as e:
            logger.error(f"Error inserting place {place['geonameid']}: {e}")

    conn.commit()
    cursor.close()
    return imported

def main():
    """Main import function."""
    geonames_file = '/home/geektrading/maps/data/geonames/allCountries.txt'

    if not os.path.exists(geonames_file):
        logger.error(f"GeoNames file not found: {geonames_file}")
        sys.exit(1)

    # Load progress
    progress = load_progress()
    if progress['completed']:
        logger.info("Import already completed. Delete progress file to re-import.")
        sys.exit(0)

    logger.info("Starting GeoNames import...")
    logger.info(f"Resuming from line: {progress.get('last_line', 0)}")

    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)

    # Ensure source index exists
    cursor = conn.cursor()
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_places_source_sourceid
        ON places(source, source_id)
    """)
    conn.commit()
    cursor.close()

    batch = []
    batch_size = 1000
    total_imported = progress['imported_count']
    skipped = 0

    last_line = progress.get('last_line', 0)

    with open(geonames_file, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            # Skip already processed lines
            if line_num <= last_line:
                continue

            place = parse_line(line)
            if place is None:
                continue

            # Check if we should import this place
            if not should_import(place['feature_class'], place['feature_code'], place['population']):
                skipped += 1
                continue

            batch.append(place)

            if len(batch) >= batch_size:
                imported = import_batch(conn, batch)
                total_imported += imported
                progress['imported_count'] = total_imported
                progress['last_line'] = line_num
                save_progress(progress)

                logger.info(f"Imported batch: {imported} places (total: {total_imported}, skipped: {skipped}, line: {line_num})")
                batch = []

    # Import final batch
    if batch:
        imported = import_batch(conn, batch)
        total_imported += imported
        progress['imported_count'] = total_imported
        progress['last_line'] = line_num

    progress['completed'] = True
    save_progress(progress)

    conn.close()

    logger.info("=" * 50)
    logger.info("IMPORT COMPLETED!")
    logger.info(f"Total places imported: {total_imported}")
    logger.info(f"Total places skipped: {skipped}")

if __name__ == '__main__':
    main()
