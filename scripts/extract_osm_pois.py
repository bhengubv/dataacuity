#!/usr/bin/env python3
"""
Extract POIs from OpenStreetMap PBF file and import into maps database.

This script extracts useful POIs (amenities, shops, tourism, etc.) from
an OSM PBF file and imports them into the database.

Requires: osmium-tool (apt install osmium-tool) and pyosmium (pip install osmium)
"""

import os
import sys
import json
import uuid
import logging
from datetime import datetime
import psycopg2

# Try to import osmium
try:
    import osmium
except ImportError:
    print("pyosmium not installed. Installing...")
    os.system("pip install osmium")
    import osmium

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/geektrading/maps/data/osm/import.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Database connection
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://maps:maps_secret_2024@localhost:5433/maps'
)

# POI categories to extract and their mappings
# Key OSM tags -> our place_type
POI_MAPPINGS = {
    # Accommodation
    ('tourism', 'hotel'): 'hotel',
    ('tourism', 'motel'): 'motel',
    ('tourism', 'guest_house'): 'guest-house',
    ('tourism', 'hostel'): 'hostel',
    ('tourism', 'camp_site'): 'campsite',
    ('tourism', 'caravan_site'): 'caravan-park',
    ('tourism', 'chalet'): 'chalet',
    ('tourism', 'apartment'): 'apartment',

    # Food & Drink
    ('amenity', 'restaurant'): 'restaurant',
    ('amenity', 'fast_food'): 'fast-food',
    ('amenity', 'cafe'): 'cafe',
    ('amenity', 'bar'): 'bar',
    ('amenity', 'pub'): 'pub',
    ('amenity', 'food_court'): 'food-court',
    ('amenity', 'ice_cream'): 'ice-cream',

    # Healthcare
    ('amenity', 'hospital'): 'hospital',
    ('amenity', 'clinic'): 'clinic',
    ('amenity', 'doctors'): 'doctor',
    ('amenity', 'dentist'): 'dentist',
    ('amenity', 'pharmacy'): 'pharmacy',
    ('amenity', 'veterinary'): 'veterinary',

    # Education
    ('amenity', 'school'): 'school',
    ('amenity', 'kindergarten'): 'kindergarten',
    ('amenity', 'college'): 'college',
    ('amenity', 'university'): 'university',
    ('amenity', 'library'): 'library',

    # Transport
    ('aeroway', 'aerodrome'): 'airport',
    ('amenity', 'bus_station'): 'bus-station',
    ('highway', 'bus_stop'): 'bus-stop',
    ('railway', 'station'): 'train-station',
    ('amenity', 'taxi'): 'taxi-rank',
    ('amenity', 'fuel'): 'fuel-station',
    ('amenity', 'parking'): 'parking',
    ('amenity', 'car_rental'): 'car-rental',
    ('amenity', 'car_wash'): 'car-wash',

    # Shopping
    ('shop', 'supermarket'): 'supermarket',
    ('shop', 'mall'): 'shopping-mall',
    ('shop', 'department_store'): 'department-store',
    ('shop', 'convenience'): 'convenience-store',
    ('shop', 'bakery'): 'bakery',
    ('shop', 'butcher'): 'butcher',
    ('shop', 'greengrocer'): 'greengrocer',
    ('shop', 'clothes'): 'clothing-store',
    ('shop', 'electronics'): 'electronics-store',
    ('shop', 'hardware'): 'hardware-store',

    # Finance
    ('amenity', 'bank'): 'bank',
    ('amenity', 'atm'): 'atm',
    ('amenity', 'bureau_de_change'): 'exchange',

    # Services
    ('amenity', 'post_office'): 'post-office',
    ('amenity', 'police'): 'police-station',
    ('amenity', 'fire_station'): 'fire-station',
    ('office', 'government'): 'government',
    ('amenity', 'courthouse'): 'courthouse',
    ('amenity', 'townhall'): 'town-hall',

    # Tourism & Recreation
    ('tourism', 'attraction'): 'attraction',
    ('tourism', 'museum'): 'museum',
    ('tourism', 'zoo'): 'zoo',
    ('tourism', 'theme_park'): 'theme-park',
    ('leisure', 'park'): 'park',
    ('leisure', 'garden'): 'garden',
    ('leisure', 'nature_reserve'): 'nature-reserve',
    ('leisure', 'stadium'): 'stadium',
    ('leisure', 'sports_centre'): 'sports-centre',
    ('leisure', 'golf_course'): 'golf-course',
    ('leisure', 'swimming_pool'): 'swimming-pool',
    ('amenity', 'cinema'): 'cinema',
    ('amenity', 'theatre'): 'theatre',
    ('amenity', 'casino'): 'casino',

    # Religious
    ('amenity', 'place_of_worship'): 'place-of-worship',

    # Other
    ('amenity', 'marketplace'): 'market',
    ('shop', 'mall'): 'shopping-mall',
    ('tourism', 'viewpoint'): 'viewpoint',
    ('tourism', 'information'): 'tourist-info',
}

class POIHandler(osmium.SimpleHandler):
    """Handler to extract POIs from OSM data."""

    def __init__(self, conn):
        super().__init__()
        self.conn = conn
        self.batch = []
        self.batch_size = 1000
        self.total_imported = 0
        self.total_skipped = 0

    def get_place_type(self, tags):
        """Determine place type from OSM tags."""
        for (key, value), place_type in POI_MAPPINGS.items():
            if tags.get(key) == value:
                return place_type
        return None

    def get_name(self, tags):
        """Get the best name for a feature."""
        # Prefer English name, fall back to default name
        return tags.get('name:en', tags.get('name', None))

    def process_feature(self, osm_id, osm_type, tags, lon, lat):
        """Process a single OSM feature."""
        place_type = self.get_place_type(tags)
        if not place_type:
            self.total_skipped += 1
            return

        name = self.get_name(tags)
        if not name:
            self.total_skipped += 1
            return

        # Create place record
        place = {
            'uuid': str(uuid.uuid4()),
            'name': name[:255],  # Truncate if needed
            'place_type': place_type,
            'lon': lon,
            'lat': lat,
            'osm_id': osm_id,
            'osm_type': osm_type,
            'source': 'osm',
            'source_id': f"{osm_type}/{osm_id}",
        }

        self.batch.append(place)

        if len(self.batch) >= self.batch_size:
            self.flush_batch()

    def flush_batch(self):
        """Write batch to database."""
        if not self.batch:
            return

        cursor = self.conn.cursor()

        insert_sql = """
            INSERT INTO places (uuid, current_name, place_type, geometry, osm_id, osm_type, source, source_id)
            VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s)
            ON CONFLICT (source, source_id) DO UPDATE SET
                current_name = EXCLUDED.current_name,
                place_type = EXCLUDED.place_type,
                geometry = EXCLUDED.geometry,
                updated_at = NOW()
        """

        for place in self.batch:
            try:
                cursor.execute(insert_sql, (
                    place['uuid'],
                    place['name'],
                    place['place_type'],
                    place['lon'],
                    place['lat'],
                    place['osm_id'],
                    place['osm_type'],
                    place['source'],
                    place['source_id'],
                ))
                self.total_imported += 1
            except Exception as e:
                logger.error(f"Error inserting {place['source_id']}: {e}")

        self.conn.commit()
        cursor.close()

        logger.info(f"Imported batch: {len(self.batch)} POIs (total: {self.total_imported})")
        self.batch = []

    def node(self, n):
        """Process a node."""
        tags = {tag.k: tag.v for tag in n.tags}
        if self.get_place_type(tags):
            self.process_feature(n.id, 'node', tags, n.location.lon, n.location.lat)

    def way(self, w):
        """Process a way (use centroid)."""
        tags = {tag.k: tag.v for tag in w.tags}
        if self.get_place_type(tags) and w.nodes:
            # Calculate centroid from first node (simplified)
            # For proper centroid, would need full geometry
            try:
                first_node = w.nodes[0]
                self.process_feature(w.id, 'way', tags, first_node.lon, first_node.lat)
            except:
                pass


def main():
    """Main import function."""
    pbf_file = '/home/geektrading/maps/data/osm/south-africa-latest.osm.pbf'

    if not os.path.exists(pbf_file):
        logger.error(f"PBF file not found: {pbf_file}")
        sys.exit(1)

    logger.info("Starting OSM POI extraction...")
    logger.info(f"Source file: {pbf_file}")

    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)

    # Create handler and process file
    handler = POIHandler(conn)

    try:
        # Process the PBF file
        handler.apply_file(pbf_file, locations=True)

        # Flush any remaining batch
        handler.flush_batch()

        logger.info("=" * 50)
        logger.info("IMPORT COMPLETED!")
        logger.info(f"Total POIs imported: {handler.total_imported}")
        logger.info(f"Total entries skipped: {handler.total_skipped}")

    except Exception as e:
        logger.error(f"Error processing file: {e}")
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
