#!/usr/bin/env python3
"""
Backfill admin codes for places imported from GeoNames.
Updates places.admin1_code and places.admin2_code using the raw GeoNames data.
"""

import os
import psycopg2
from datetime import datetime
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'maps',
    'user': 'maps',
    'password': os.environ.get('MAPS_DB_PASSWORD', 'maps_secret_2024')
}

GEONAMES_FILE = '/home/geektrading/maps/data/geonames/allCountries.txt'

def build_admin_codes_map():
    """Build a mapping from geonameid to admin codes."""
    logger.info("Building admin codes map from GeoNames file...")
    admin_map = {}

    with open(GEONAMES_FILE, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            if i % 1000000 == 0:
                logger.info(f"  Processed {i:,} lines...")

            parts = line.strip().split('\t')
            if len(parts) < 19:
                continue

            try:
                geonameid = parts[0]
                country_code = parts[8] if parts[8] else None
                raw_admin1 = parts[10] if len(parts) > 10 and parts[10] else None
                raw_admin2 = parts[11] if len(parts) > 11 and parts[11] else None

                if country_code and raw_admin1:
                    admin1_code = f"{country_code}.{raw_admin1}"
                    admin2_code = f"{country_code}.{raw_admin1}.{raw_admin2}" if raw_admin2 else None
                    admin_map[geonameid] = (admin1_code, admin2_code)
            except (ValueError, IndexError):
                continue

    logger.info(f"Built map with {len(admin_map):,} entries")
    return admin_map

def backfill_admin_codes():
    """Update places table with admin codes."""
    logger.info("Starting admin code backfill...")

    # Build mapping
    admin_map = build_admin_codes_map()

    # Connect to database
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # Get all GeoNames places that need updating
    logger.info("Fetching places needing updates...")
    cursor.execute("""
        SELECT id, source_id
        FROM places
        WHERE source = 'geonames'
        AND (admin1_code IS NULL OR admin2_code IS NULL)
    """)
    places = cursor.fetchall()
    logger.info(f"Found {len(places):,} places to update")

    # Update in batches
    batch_size = 1000
    updated = 0
    skipped = 0

    update_sql = """
        UPDATE places
        SET admin1_code = %s, admin2_code = %s, updated_at = NOW()
        WHERE id = %s
    """

    for i, (place_id, source_id) in enumerate(places, 1):
        if source_id in admin_map:
            admin1_code, admin2_code = admin_map[source_id]
            cursor.execute(update_sql, (admin1_code, admin2_code, place_id))
            updated += 1
        else:
            skipped += 1

        if i % batch_size == 0:
            conn.commit()
            logger.info(f"Progress: {i:,}/{len(places):,} ({updated:,} updated, {skipped:,} skipped)")

    conn.commit()
    cursor.close()
    conn.close()

    logger.info(f"\nBackfill complete!")
    logger.info(f"  Updated: {updated:,}")
    logger.info(f"  Skipped (no admin data): {skipped:,}")

if __name__ == '__main__':
    start = datetime.now()
    backfill_admin_codes()
    elapsed = datetime.now() - start
    logger.info(f"Total time: {elapsed}")
