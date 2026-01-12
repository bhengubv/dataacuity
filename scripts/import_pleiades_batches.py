#!/usr/bin/env python3
"""
Pleiades Batch Importer for DataAcuity Maps

This script imports prepared batch files into PostgreSQL with:
- Rate limiting (configurable delay between batches)
- Progress tracking (resume from where it left off)
- Error handling and logging
- Duplicate prevention

Run with: python3 import_pleiades_batches.py [--delay SECONDS] [--batch-limit N]
"""

import json
import os
import sys
import time
import argparse
import logging
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

# Configuration
BATCHES_DIR = '/home/geektrading/maps/data/pleiades/batches'
SUMMARY_FILE = '/home/geektrading/maps/data/pleiades/import_summary.json'
PROGRESS_FILE = '/home/geektrading/maps/data/pleiades/import_progress.json'
LOG_FILE = '/home/geektrading/maps/data/pleiades/import.log'

# Database connection
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'maps',
    'user': 'maps',
    'password': 'maps_secret_2024'
}

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def get_db_connection():
    """Create database connection"""
    return psycopg2.connect(**DB_CONFIG)


def init_progress():
    """Initialize or read progress file"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)

    progress = {
        'next_batch': 1,
        'imported_batches': 0,
        'imported_places': 0,
        'imported_names': 0,
        'errors': 0,
        'completed': False,
        'started_at': datetime.now().isoformat(),
        'last_import_time': None
    }
    save_progress(progress)
    return progress


def save_progress(progress):
    """Save progress to file"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)


def import_batch(conn, batch_file):
    """Import a single batch file"""
    with open(batch_file, 'r', encoding='utf-8') as f:
        batch_data = json.load(f)

    places = batch_data['places']
    places_imported = 0
    names_imported = 0

    cursor = conn.cursor()

    for place in places:
        try:
            # Insert place
            cursor.execute("""
                INSERT INTO places (current_name, geometry, place_type, created_at)
                VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, NOW())
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (
                place['current_name'],
                place['lng'],
                place['lat'],
                place['place_type']
            ))

            result = cursor.fetchone()
            if result:
                place_id = result[0]
                places_imported += 1

                # Insert historical names
                for name in place.get('historical_names', []):
                    cursor.execute("""
                        INSERT INTO place_names
                        (place_id, name, name_native, language, year_start, year_end,
                         source_title, source_url, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT DO NOTHING
                    """, (
                        place_id,
                        name['name'],
                        name.get('name_native'),
                        name.get('language', 'unknown'),
                        name.get('year_start'),
                        name.get('year_end'),
                        name.get('source_title', 'Pleiades'),
                        name.get('source_url', '')
                    ))
                    names_imported += 1

        except Exception as e:
            logger.error(f"Error importing place {place.get('current_name')}: {e}")
            continue

    conn.commit()
    cursor.close()

    return places_imported, names_imported


def main():
    parser = argparse.ArgumentParser(description='Import Pleiades data into DataAcuity Maps')
    parser.add_argument('--delay', type=int, default=120,
                        help='Delay between batches in seconds (default: 120)')
    parser.add_argument('--batch-limit', type=int, default=0,
                        help='Maximum batches to import (0 = unlimited)')
    parser.add_argument('--reset', action='store_true',
                        help='Reset progress and start from beginning')
    args = parser.parse_args()

    # Load summary
    if not os.path.exists(SUMMARY_FILE):
        logger.error(f"Summary file not found: {SUMMARY_FILE}")
        logger.error("Run prepare_pleiades_batches.py first!")
        sys.exit(1)

    with open(SUMMARY_FILE, 'r') as f:
        summary = json.load(f)

    total_batches = summary['total_batches']
    logger.info(f"Total batches to import: {total_batches}")

    # Initialize progress
    if args.reset and os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)

    progress = init_progress()

    if progress['completed']:
        logger.info("Import already completed!")
        logger.info(f"Total places imported: {progress['imported_places']}")
        logger.info(f"Total names imported: {progress['imported_names']}")
        return

    logger.info(f"Starting from batch {progress['next_batch']}")
    logger.info(f"Delay between batches: {args.delay} seconds")

    # Connect to database
    try:
        conn = get_db_connection()
        logger.info("Connected to database")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        sys.exit(1)

    batches_processed = 0

    try:
        while progress['next_batch'] <= total_batches:
            if args.batch_limit > 0 and batches_processed >= args.batch_limit:
                logger.info(f"Reached batch limit of {args.batch_limit}")
                break

            batch_num = progress['next_batch']
            batch_file = os.path.join(BATCHES_DIR, f"batch_{batch_num:04d}.json")

            if not os.path.exists(batch_file):
                logger.error(f"Batch file not found: {batch_file}")
                progress['errors'] += 1
                progress['next_batch'] += 1
                save_progress(progress)
                continue

            logger.info(f"Importing batch {batch_num}/{total_batches}...")

            try:
                places, names = import_batch(conn, batch_file)

                progress['imported_batches'] += 1
                progress['imported_places'] += places
                progress['imported_names'] += names
                progress['next_batch'] += 1
                progress['last_import_time'] = datetime.now().isoformat()

                logger.info(f"  Imported {places} places, {names} names")
                logger.info(f"  Total progress: {progress['imported_places']} places, {progress['imported_names']} names")

            except Exception as e:
                logger.error(f"Error importing batch {batch_num}: {e}")
                progress['errors'] += 1
                progress['next_batch'] += 1

            save_progress(progress)
            batches_processed += 1

            # Rate limiting
            if progress['next_batch'] <= total_batches:
                remaining = total_batches - progress['next_batch'] + 1
                eta_seconds = remaining * args.delay
                eta_hours = eta_seconds / 3600
                logger.info(f"  Waiting {args.delay}s... (ETA: {eta_hours:.1f} hours for {remaining} remaining batches)")
                time.sleep(args.delay)

        # Mark complete
        if progress['next_batch'] > total_batches:
            progress['completed'] = True
            progress['completed_at'] = datetime.now().isoformat()
            save_progress(progress)
            logger.info("=" * 50)
            logger.info("IMPORT COMPLETED!")
            logger.info(f"Total places imported: {progress['imported_places']}")
            logger.info(f"Total names imported: {progress['imported_names']}")
            logger.info(f"Errors: {progress['errors']}")

    finally:
        conn.close()


if __name__ == '__main__':
    main()
