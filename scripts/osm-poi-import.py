#!/usr/bin/env python3
"""
OSM POI Bulk Importer for DataAcuity Maps
Imports POIs from OpenStreetMap via Overpass API
"""

import requests
import psycopg2
import json
import time
from typing import List, Dict, Any

# Database connection - requires environment variables
import os

DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5433')
DB_NAME = os.environ.get('DB_NAME', 'maps')
DB_USER = os.environ.get('DB_USER', 'maps')
DB_PASSWORD = os.environ.get('DB_PASSWORD')

if not DB_PASSWORD:
    print("ERROR: DB_PASSWORD environment variable is required")
    print("Set it with: export DB_PASSWORD=your_password")
    exit(1)

DB_CONFIG = {
    "host": DB_HOST,
    "port": int(DB_PORT),
    "database": DB_NAME,
    "user": DB_USER,
    "password": DB_PASSWORD
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# POI categories to import with their OSM tags
POI_CATEGORIES = {
    "Fuel": {
        "query": 'node["amenity"="fuel"](area.sa);',
        "icon": "local_gas_station",
        "color": "#ff5722"
    },
    "ATM": {
        "query": 'node["amenity"="atm"](area.sa);node["amenity"="bank"]["atm"="yes"](area.sa);',
        "icon": "atm", 
        "color": "#4caf50"
    },
    "Restaurant": {
        "query": 'node["amenity"="restaurant"](area.sa);node["amenity"="fast_food"](area.sa);',
        "icon": "restaurant",
        "color": "#ff9800"
    },
    "Cafe": {
        "query": 'node["amenity"="cafe"](area.sa);',
        "icon": "local_cafe",
        "color": "#795548"
    },
    "Hotel": {
        "query": 'node["tourism"="hotel"](area.sa);node["tourism"="guest_house"](area.sa);node["tourism"="motel"](area.sa);',
        "icon": "hotel",
        "color": "#9c27b0"
    },
    "Hospital": {
        "query": 'node["amenity"="hospital"](area.sa);node["amenity"="clinic"](area.sa);',
        "icon": "local_hospital",
        "color": "#f44336"
    },
    "Pharmacy": {
        "query": 'node["amenity"="pharmacy"](area.sa);',
        "icon": "local_pharmacy",
        "color": "#e91e63"
    },
    "School": {
        "query": 'node["amenity"="school"](area.sa);',
        "icon": "school",
        "color": "#3f51b5"
    },
    "University": {
        "query": 'node["amenity"="university"](area.sa);node["amenity"="college"](area.sa);',
        "icon": "school",
        "color": "#3f51b5"
    },
    "Supermarket": {
        "query": 'node["shop"="supermarket"](area.sa);',
        "icon": "shopping_cart",
        "color": "#e91e63"
    },
    "Mall": {
        "query": 'node["shop"="mall"](area.sa);way["shop"="mall"](area.sa);',
        "icon": "shopping_cart",
        "color": "#e91e63"
    },
    "Bank": {
        "query": 'node["amenity"="bank"](area.sa);',
        "icon": "account_balance",
        "color": "#607d8b"
    },
    "Police": {
        "query": 'node["amenity"="police"](area.sa);',
        "icon": "local_police",
        "color": "#1a237e"
    },
    "Fire Station": {
        "query": 'node["amenity"="fire_station"](area.sa);',
        "icon": "local_fire_department",
        "color": "#d32f2f"
    },
    "Post Office": {
        "query": 'node["amenity"="post_office"](area.sa);',
        "icon": "local_post_office",
        "color": "#ff5722"
    },
    "Gym": {
        "query": 'node["leisure"="fitness_centre"](area.sa);node["leisure"="gym"](area.sa);',
        "icon": "fitness_center",
        "color": "#4caf50"
    },
    "Parking": {
        "query": 'node["amenity"="parking"](area.sa);',
        "icon": "local_parking",
        "color": "#2196f3"
    },
    "Bus Station": {
        "query": 'node["amenity"="bus_station"](area.sa);node["highway"="bus_stop"](area.sa);',
        "icon": "directions_bus",
        "color": "#00bcd4"
    },
    "Train Station": {
        "query": 'node["railway"="station"](area.sa);',
        "icon": "train",
        "color": "#00bcd4"
    },
    "Cinema": {
        "query": 'node["amenity"="cinema"](area.sa);',
        "icon": "local_movies",
        "color": "#e91e63"
    },
    "Bar": {
        "query": 'node["amenity"="bar"](area.sa);node["amenity"="pub"](area.sa);',
        "icon": "local_bar",
        "color": "#ff9800"
    },
    "Church": {
        "query": 'node["amenity"="place_of_worship"]["religion"="christian"](area.sa);',
        "icon": "church",
        "color": "#795548"
    },
    "Mosque": {
        "query": 'node["amenity"="place_of_worship"]["religion"="muslim"](area.sa);',
        "icon": "mosque",
        "color": "#4caf50"
    },
    "Park": {
        "query": 'node["leisure"="park"](area.sa);',
        "icon": "park",
        "color": "#4caf50"
    },
    "Beach": {
        "query": 'node["natural"="beach"](area.sa);',
        "icon": "beach_access",
        "color": "#00bcd4"
    },
    "Tourist Attraction": {
        "query": 'node["tourism"="attraction"](area.sa);node["tourism"="viewpoint"](area.sa);',
        "icon": "attractions",
        "color": "#ff5722"
    },
    "Car Wash": {
        "query": 'node["amenity"="car_wash"](area.sa);',
        "icon": "local_car_wash",
        "color": "#2196f3"
    },
    "Car Repair": {
        "query": 'node["shop"="car_repair"](area.sa);node["shop"="car"](area.sa);',
        "icon": "car_repair",
        "color": "#607d8b"
    }
}

def fetch_osm_data(category: str, query: str) -> List[Dict[str, Any]]:
    """Fetch POI data from Overpass API"""
    
    # South Africa area ID in Overpass
    overpass_query = f"""
    [out:json][timeout:300];
    area["ISO3166-1"="ZA"]->.sa;
    (
      {query}
    );
    out center;
    """
    
    print(f"  Fetching {category} from OSM...")
    
    try:
        response = requests.post(
            OVERPASS_URL,
            data={"data": overpass_query},
            timeout=300
        )
        response.raise_for_status()
        data = response.json()
        
        elements = data.get("elements", [])
        print(f"  Found {len(elements)} {category} POIs")
        return elements
        
    except Exception as e:
        print(f"  Error fetching {category}: {e}")
        return []

def get_poi_name(element: Dict[str, Any]) -> str:
    """Extract the best name from OSM element"""
    tags = element.get("tags", {})
    
    # Try different name fields
    for key in ["name", "name:en", "brand", "operator", "ref"]:
        if key in tags:
            return tags[key]
    
    return None

def get_poi_city(lat: float, lng: float) -> str:
    """Rough city assignment based on coordinates"""
    # Major SA cities with bounding boxes (simplified)
    cities = [
        ("Johannesburg", -26.5, -25.9, 27.7, 28.4),
        ("Pretoria", -26.0, -25.5, 28.0, 28.5),
        ("Cape Town", -34.3, -33.7, 18.2, 19.0),
        ("Durban", -30.1, -29.7, 30.8, 31.2),
        ("Port Elizabeth", -34.1, -33.8, 25.4, 26.0),
        ("Bloemfontein", -29.3, -29.0, 26.1, 26.4),
        ("East London", -33.1, -32.9, 27.8, 28.0),
        ("Polokwane", -24.0, -23.8, 29.4, 29.6),
        ("Nelspruit", -25.6, -25.4, 30.9, 31.1),
        ("Kimberley", -28.8, -28.7, 24.7, 24.8),
    ]
    
    for city, lat_min, lat_max, lng_min, lng_max in cities:
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return city
    
    return "South Africa"

def import_pois(category_name: str, config: Dict[str, Any], conn) -> int:
    """Import POIs for a single category"""
    
    elements = fetch_osm_data(category_name, config["query"])
    
    if not elements:
        return 0
    
    cursor = conn.cursor()
    imported = 0
    
    # Ensure category exists
    cursor.execute("""
        INSERT INTO poi_categories (name, icon, color)
        VALUES (%s, %s, %s)
        ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon, color = EXCLUDED.color
        RETURNING id
    """, (category_name, config["icon"], config["color"]))
    
    category_id = cursor.fetchone()[0]
    
    for element in elements:
        name = get_poi_name(element)
        if not name:
            continue
            
        # Get coordinates (center for ways/relations)
        if "center" in element:
            lat = element["center"]["lat"]
            lng = element["center"]["lon"]
        else:
            lat = element.get("lat")
            lng = element.get("lon")
        
        if not lat or not lng:
            continue
        
        city = get_poi_city(lat, lng)
        tags = element.get("tags", {})
        
        # Build address from tags
        address_parts = []
        for key in ["addr:street", "addr:housenumber", "addr:suburb", "addr:city"]:
            if key in tags:
                address_parts.append(tags[key])
        address = ", ".join(address_parts) if address_parts else None
        
        # Additional metadata
        metadata = {
            "osm_id": element.get("id"),
            "osm_type": element.get("type"),
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "website": tags.get("website") or tags.get("contact:website"),
            "opening_hours": tags.get("opening_hours"),
            "brand": tags.get("brand"),
            "operator": tags.get("operator")
        }
        # Remove None values
        metadata = {k: v for k, v in metadata.items() if v}
        
        # Truncate fields to avoid DB errors
        phone = (metadata.get("phone") or "")[:100] or None
        website = (metadata.get("website") or "")[:500] or None

        try:
            cursor.execute("""
                INSERT INTO pois (name, category_id, latitude, longitude, city, address, phone, website, source, osm_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'osm', %s)
                ON CONFLICT (name, latitude, longitude) DO UPDATE SET
                    category_id = EXCLUDED.category_id,
                    city = EXCLUDED.city,
                    address = COALESCE(EXCLUDED.address, pois.address),
                    phone = COALESCE(EXCLUDED.phone, pois.phone),
                    website = COALESCE(EXCLUDED.website, pois.website),
                    osm_id = EXCLUDED.osm_id,
                    updated_at = NOW()
            """, (name, category_id, lat, lng, city, address, phone, website, metadata.get("osm_id")))
            imported += 1
        except Exception as e:
            # Rollback and continue
            conn.rollback()
            continue
    
    conn.commit()
    return imported

def main():
    print("=" * 60)
    print("OSM POI Bulk Importer for DataAcuity Maps")
    print("=" * 60)
    print()
    
    # Connect to database
    print("Connecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)
    
    # Ensure indexes exist
    cursor = conn.cursor()
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS pois_name_coords_idx ON pois (name, latitude, longitude);
    """)
    conn.commit()
    
    total_imported = 0
    
    for category_name, config in POI_CATEGORIES.items():
        print(f"\n[{category_name}]")
        count = import_pois(category_name, config, conn)
        total_imported += count
        print(f"  Imported: {count}")
        
        # Be nice to Overpass API - wait between requests
        time.sleep(2)
    
    print()
    print("=" * 60)
    print(f"TOTAL IMPORTED: {total_imported} POIs")
    print("=" * 60)
    
    # Show final counts
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.name, COUNT(p.id) 
        FROM poi_categories c 
        LEFT JOIN pois p ON p.category_id = c.id 
        GROUP BY c.name 
        ORDER BY COUNT(p.id) DESC
    """)
    
    print("\nPOI counts by category:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")
    
    conn.close()

if __name__ == "__main__":
    main()
