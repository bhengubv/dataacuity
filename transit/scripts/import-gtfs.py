#!/usr/bin/env python3
"""
GTFS Feed Importer for SA Transit Data Hub
Downloads and imports GTFS feeds into the database
"""

import os
import sys
import csv
import zipfile
import tempfile
import logging
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any
from io import StringIO

import asyncpg
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://maps:maps_secret_2024@localhost:5433/maps")

# Known GTFS feeds for South Africa
GTFS_FEEDS = {
    "gautrain": {
        "name": "Gautrain",
        "url": "https://gtfs.gautrain.co.za/gtfs.zip",  # Contact gautrain.co.za for access
        "source_id": 1,
        "region": "Gauteng"
    },
    "myciti": {
        "name": "MyCiTi",
        "url": "https://myciti.org.za/gtfs/gtfs.zip",  # Contact City of Cape Town for access
        "source_id": 2,
        "region": "Western Cape"
    },
    "gogeorge": {
        "name": "GO GEORGE",
        "url": "https://gogeorge.org.za/gtfs/gtfs.zip",  # Contact GO GEORGE for access
        "source_id": 9,
        "region": "Western Cape"
    },
    "areyeng": {
        "name": "A Re Yeng",
        "url": "https://www.tshwane.gov.za/gtfs/areyeng.zip",  # Contact City of Tshwane for access
        "source_id": 8,
        "region": "Gauteng"
    },
    "stellenbosch": {
        "name": "Stellenbosch Taxis",
        "url": "https://hub.tumidata.org/dataset/1300a0a6-a7b0-4e0e-b94a-eb5e4791828b/resource/72047f01-437c-4803-b986-2bab55b41358/download/stellenbosch_gtfs_v3.zip",
        "source_id": 11,
        "region": "Western Cape"
    }
}

class GTFSImporter:
    """Import GTFS feeds into the database"""

    def __init__(self, db_pool: asyncpg.Pool, source_id: int):
        self.db_pool = db_pool
        self.source_id = source_id
        self.stats = {
            "agencies": 0,
            "stops": 0,
            "routes": 0,
            "trips": 0,
            "stop_times": 0,
            "calendar": 0,
            "calendar_dates": 0,
            "shapes": 0,
            "fare_attributes": 0,
            "fare_rules": 0,
            "frequencies": 0,
            "transfers": 0
        }

    async def import_feed(self, gtfs_path: str) -> Dict[str, int]:
        """Import a GTFS feed from a ZIP file or directory"""
        if os.path.isfile(gtfs_path):
            # Extract ZIP file
            with tempfile.TemporaryDirectory() as tmpdir:
                with zipfile.ZipFile(gtfs_path, 'r') as zip_ref:
                    zip_ref.extractall(tmpdir)
                await self._import_directory(tmpdir)
        else:
            await self._import_directory(gtfs_path)

        return self.stats

    async def _import_directory(self, path: str):
        """Import GTFS files from a directory"""
        path = Path(path)

        # Import in order of dependencies
        import_order = [
            ("agency.txt", self._import_agencies),
            ("stops.txt", self._import_stops),
            ("routes.txt", self._import_routes),
            ("calendar.txt", self._import_calendar),
            ("calendar_dates.txt", self._import_calendar_dates),
            ("shapes.txt", self._import_shapes),
            ("trips.txt", self._import_trips),
            ("stop_times.txt", self._import_stop_times),
            ("fare_attributes.txt", self._import_fare_attributes),
            ("fare_rules.txt", self._import_fare_rules),
            ("frequencies.txt", self._import_frequencies),
            ("transfers.txt", self._import_transfers),
            ("feed_info.txt", self._import_feed_info),
        ]

        for filename, import_func in import_order:
            filepath = path / filename
            if filepath.exists():
                logger.info(f"Importing {filename}...")
                try:
                    await import_func(filepath)
                except Exception as e:
                    logger.error(f"Error importing {filename}: {e}")
            else:
                logger.debug(f"Skipping {filename} (not found)")

        # Generate shape geometries
        await self._generate_shape_geometries()

    def _read_csv(self, filepath: Path) -> list:
        """Read a CSV file and return list of dicts"""
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            # Handle BOM and normalize field names
            reader = csv.DictReader(f)
            return list(reader)

    def _safe_int(self, value, default=0):
        """Safely convert value to int, returning default for empty/invalid"""
        if value is None or value == '':
            return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    def _safe_float(self, value, default=None):
        """Safely convert value to float, returning default for empty/invalid"""
        if value is None or value == '':
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    async def _import_agencies(self, filepath: Path):
        """Import agency.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            for row in rows:
                await conn.execute("""
                    INSERT INTO agencies (
                        agency_id, data_source_id, agency_name, agency_url,
                        agency_timezone, agency_lang, agency_phone, agency_fare_url
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (agency_id, data_source_id) DO UPDATE SET
                        agency_name = EXCLUDED.agency_name,
                        agency_url = EXCLUDED.agency_url,
                        updated_at = NOW()
                """,
                    row.get('agency_id', '1'),
                    self.source_id,
                    row['agency_name'],
                    row.get('agency_url'),
                    row.get('agency_timezone', 'Africa/Johannesburg'),
                    row.get('agency_lang', 'en'),
                    row.get('agency_phone'),
                    row.get('agency_fare_url')
                )
                self.stats["agencies"] += 1

    async def _import_stops(self, filepath: Path):
        """Import stops.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            # Use COPY for bulk import
            records = []
            for row in rows:
                records.append((
                    row['stop_id'],
                    self.source_id,
                    row.get('stop_code') or None,
                    row['stop_name'],
                    row.get('stop_desc') or None,
                    float(row['stop_lat']),
                    float(row['stop_lon']),
                    row.get('zone_id') or None,
                    row.get('stop_url') or None,
                    self._safe_int(row.get('location_type'), 0),
                    row.get('parent_station') or None,
                    self._safe_int(row.get('wheelchair_boarding'), 0)
                ))

            # Clear existing stops for this source
            await conn.execute(
                "DELETE FROM stops WHERE data_source_id = $1",
                self.source_id
            )

            # Bulk insert
            await conn.executemany("""
                INSERT INTO stops (
                    stop_id, data_source_id, stop_code, stop_name, stop_desc,
                    stop_lat, stop_lon, zone_id, stop_url, location_type,
                    parent_station, wheelchair_boarding
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """, records)

            self.stats["stops"] = len(records)

    async def _import_routes(self, filepath: Path):
        """Import routes.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM routes WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO routes (
                        route_id, data_source_id, agency_id, route_short_name,
                        route_long_name, route_desc, route_type, route_url,
                        route_color, route_text_color, route_sort_order
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                    row['route_id'],
                    self.source_id,
                    row.get('agency_id', '1'),
                    row.get('route_short_name'),
                    row.get('route_long_name'),
                    row.get('route_desc'),
                    int(row['route_type']),
                    row.get('route_url'),
                    row.get('route_color', '').lstrip('#') or None,
                    row.get('route_text_color', '').lstrip('#') or None,
                    int(row['route_sort_order']) if row.get('route_sort_order') else None
                )
                self.stats["routes"] += 1

    async def _import_calendar(self, filepath: Path):
        """Import calendar.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM calendar WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO calendar (
                        service_id, data_source_id, monday, tuesday, wednesday,
                        thursday, friday, saturday, sunday, start_date, end_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                    row['service_id'],
                    self.source_id,
                    row['monday'] == '1',
                    row['tuesday'] == '1',
                    row['wednesday'] == '1',
                    row['thursday'] == '1',
                    row['friday'] == '1',
                    row['saturday'] == '1',
                    row['sunday'] == '1',
                    datetime.strptime(row['start_date'], '%Y%m%d').date(),
                    datetime.strptime(row['end_date'], '%Y%m%d').date()
                )
                self.stats["calendar"] += 1

    async def _import_calendar_dates(self, filepath: Path):
        """Import calendar_dates.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM calendar_dates WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO calendar_dates (
                        service_id, data_source_id, date, exception_type
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                """,
                    row['service_id'],
                    self.source_id,
                    datetime.strptime(row['date'], '%Y%m%d').date(),
                    int(row['exception_type'])
                )
                self.stats["calendar_dates"] += 1

    async def _import_shapes(self, filepath: Path):
        """Import shapes.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM shapes WHERE data_source_id = $1",
                self.source_id
            )

            records = []
            for row in rows:
                records.append((
                    row['shape_id'],
                    self.source_id,
                    float(row['shape_pt_lat']),
                    float(row['shape_pt_lon']),
                    int(row['shape_pt_sequence']),
                    float(row['shape_dist_traveled']) if row.get('shape_dist_traveled') else None
                ))

            await conn.executemany("""
                INSERT INTO shapes (
                    shape_id, data_source_id, shape_pt_lat, shape_pt_lon,
                    shape_pt_sequence, shape_dist_traveled
                ) VALUES ($1, $2, $3, $4, $5, $6)
            """, records)

            self.stats["shapes"] = len(records)

    async def _import_trips(self, filepath: Path):
        """Import trips.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM trips WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO trips (
                        trip_id, data_source_id, route_id, service_id,
                        trip_headsign, trip_short_name, direction_id,
                        block_id, shape_id, wheelchair_accessible, bikes_allowed
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                    row['trip_id'],
                    self.source_id,
                    row['route_id'],
                    row['service_id'],
                    row.get('trip_headsign') or None,
                    row.get('trip_short_name') or None,
                    self._safe_int(row.get('direction_id'), None),
                    row.get('block_id') or None,
                    row.get('shape_id') or None,
                    self._safe_int(row.get('wheelchair_accessible'), 0),
                    self._safe_int(row.get('bikes_allowed'), 0)
                )
                self.stats["trips"] += 1

    async def _import_stop_times(self, filepath: Path):
        """Import stop_times.txt (largest file, batch processing)"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM stop_times WHERE data_source_id = $1",
                self.source_id
            )

            batch = []
            batch_size = 10000

            for i, row in enumerate(rows):
                # Convert time strings to intervals
                arr_time = self._parse_gtfs_time(row['arrival_time'])
                dep_time = self._parse_gtfs_time(row['departure_time'])

                batch.append((
                    row['trip_id'],
                    self.source_id,
                    arr_time,
                    dep_time,
                    row['stop_id'],
                    self._safe_int(row['stop_sequence'], 0),
                    row.get('stop_headsign') or None,
                    self._safe_int(row.get('pickup_type'), 0),
                    self._safe_int(row.get('drop_off_type'), 0),
                    self._safe_float(row.get('shape_dist_traveled')),
                    self._safe_int(row.get('timepoint'), 1)
                ))

                if len(batch) >= batch_size:
                    await self._insert_stop_times_batch(conn, batch)
                    self.stats["stop_times"] += len(batch)
                    batch = []
                    logger.info(f"  Imported {self.stats['stop_times']} stop_times...")

            if batch:
                await self._insert_stop_times_batch(conn, batch)
                self.stats["stop_times"] += len(batch)

    async def _insert_stop_times_batch(self, conn, batch):
        """Insert a batch of stop_times"""
        await conn.executemany("""
            INSERT INTO stop_times (
                trip_id, data_source_id, arrival_time, departure_time,
                stop_id, stop_sequence, stop_headsign, pickup_type,
                drop_off_type, shape_dist_traveled, timepoint
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        """, batch)

    def _parse_gtfs_time(self, time_str: str) -> timedelta:
        """Parse GTFS time string (can be > 24:00:00) to timedelta"""
        parts = time_str.strip().split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2]) if len(parts) > 2 else 0
        return timedelta(hours=hours, minutes=minutes, seconds=seconds)

    async def _import_fare_attributes(self, filepath: Path):
        """Import fare_attributes.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM fare_attributes WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO fare_attributes (
                        fare_id, data_source_id, price, currency_type,
                        payment_method, transfers, agency_id, transfer_duration
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                    row['fare_id'],
                    self.source_id,
                    float(row['price']),
                    row.get('currency_type', 'ZAR'),
                    int(row['payment_method']),
                    int(row['transfers']) if row.get('transfers') else None,
                    row.get('agency_id'),
                    int(row['transfer_duration']) if row.get('transfer_duration') else None
                )
                self.stats["fare_attributes"] += 1

    async def _import_fare_rules(self, filepath: Path):
        """Import fare_rules.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM fare_rules WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO fare_rules (
                        fare_id, data_source_id, route_id,
                        origin_id, destination_id, contains_id
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                    row['fare_id'],
                    self.source_id,
                    row.get('route_id'),
                    row.get('origin_id'),
                    row.get('destination_id'),
                    row.get('contains_id')
                )
                self.stats["fare_rules"] += 1

    async def _import_frequencies(self, filepath: Path):
        """Import frequencies.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM frequencies WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO frequencies (
                        trip_id, data_source_id, start_time, end_time,
                        headway_secs, exact_times
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                    row['trip_id'],
                    self.source_id,
                    self._parse_gtfs_time(row['start_time']),
                    self._parse_gtfs_time(row['end_time']),
                    int(row['headway_secs']),
                    int(row.get('exact_times', 0))
                )
                self.stats["frequencies"] += 1

    async def _import_transfers(self, filepath: Path):
        """Import transfers.txt"""
        rows = self._read_csv(filepath)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM transfers WHERE data_source_id = $1",
                self.source_id
            )

            for row in rows:
                await conn.execute("""
                    INSERT INTO transfers (
                        from_stop_id, to_stop_id, data_source_id,
                        transfer_type, min_transfer_time
                    ) VALUES ($1, $2, $3, $4, $5)
                """,
                    row['from_stop_id'],
                    row['to_stop_id'],
                    self.source_id,
                    int(row['transfer_type']),
                    int(row['min_transfer_time']) if row.get('min_transfer_time') else None
                )
                self.stats["transfers"] += 1

    async def _import_feed_info(self, filepath: Path):
        """Import feed_info.txt"""
        rows = self._read_csv(filepath)

        if not rows:
            return

        row = rows[0]

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM feed_info WHERE data_source_id = $1",
                self.source_id
            )

            await conn.execute("""
                INSERT INTO feed_info (
                    data_source_id, feed_publisher_name, feed_publisher_url,
                    feed_lang, feed_start_date, feed_end_date, feed_version,
                    feed_contact_email, feed_contact_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
                self.source_id,
                row['feed_publisher_name'],
                row.get('feed_publisher_url'),
                row.get('feed_lang', 'en'),
                datetime.strptime(row['feed_start_date'], '%Y%m%d').date() if row.get('feed_start_date') else None,
                datetime.strptime(row['feed_end_date'], '%Y%m%d').date() if row.get('feed_end_date') else None,
                row.get('feed_version'),
                row.get('feed_contact_email'),
                row.get('feed_contact_url')
            )

    async def _generate_shape_geometries(self):
        """Generate LineString geometries from shape points"""
        logger.info("Generating shape geometries...")

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM shape_geometries WHERE data_source_id = $1",
                self.source_id
            )

            await conn.execute("""
                INSERT INTO shape_geometries (shape_id, data_source_id, geometry, total_distance_meters)
                SELECT
                    shape_id,
                    data_source_id,
                    ST_MakeLine(
                        ST_SetSRID(ST_MakePoint(shape_pt_lon, shape_pt_lat), 4326)
                        ORDER BY shape_pt_sequence
                    ) as geometry,
                    MAX(shape_dist_traveled) as total_distance
                FROM shapes
                WHERE data_source_id = $1
                GROUP BY shape_id, data_source_id
            """, self.source_id)


async def download_gtfs(url: str, output_path: str) -> bool:
    """Download a GTFS feed"""
    logger.info(f"Downloading GTFS from {url}...")

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()

            with open(output_path, 'wb') as f:
                f.write(response.content)

            logger.info(f"Downloaded to {output_path}")
            return True
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return False


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Import GTFS feeds into SA Transit Data Hub")
    parser.add_argument("--feed", choices=list(GTFS_FEEDS.keys()), help="Known feed to import")
    parser.add_argument("--url", help="URL to download GTFS from")
    parser.add_argument("--file", help="Local GTFS ZIP file or directory")
    parser.add_argument("--source-id", type=int, help="Data source ID", required=True)
    parser.add_argument("--database-url", default=DATABASE_URL, help="Database URL")

    args = parser.parse_args()

    if not any([args.feed, args.url, args.file]):
        parser.error("Provide --feed, --url, or --file")

    # Connect to database
    pool = await asyncpg.create_pool(args.database_url, min_size=2, max_size=5)

    try:
        importer = GTFSImporter(pool, args.source_id)

        if args.file:
            # Import from local file
            stats = await importer.import_feed(args.file)
        else:
            # Download first
            url = args.url or GTFS_FEEDS[args.feed]["url"]

            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                tmp_path = tmp.name

            try:
                if await download_gtfs(url, tmp_path):
                    stats = await importer.import_feed(tmp_path)
                else:
                    logger.error("Download failed")
                    return
            finally:
                os.unlink(tmp_path)

        # Update data source last_updated
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE data_sources SET last_updated = NOW()
                WHERE id = $1
            """, args.source_id)

        logger.info("Import complete!")
        logger.info(f"Statistics: {stats}")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
