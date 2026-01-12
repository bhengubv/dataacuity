#!/usr/bin/env python3
"""
Import missing POI categories from OpenStreetMap
Uses regional queries to avoid Overpass API timeouts
"""

import requests
import psycopg2
import time

DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "maps",
    "user": "maps",
    "password": "maps_secret_2024"
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Regions to query separately (bounding boxes: south, west, north, east)
SA_REGIONS = {
    "Gauteng": (-26.5, 27.5, -25.2, 29.0),
    "Western Cape": (-34.5, 18.0, -31.5, 21.0),
    "KwaZulu-Natal": (-31.0, 29.0, -27.0, 32.5),
    "Eastern Cape": (-34.0, 24.0, -31.0, 30.0),
    "Mpumalanga": (-26.5, 29.0, -24.5, 32.0),
    "Limpopo": (-24.5, 27.0, -22.0, 31.5),
    "North West": (-27.5, 24.0, -25.0, 28.0),
    "Free State": (-30.5, 24.0, -27.5, 29.5),
    "Northern Cape": (-32.0, 17.0, -28.0, 24.0),
}

# Missing categories to import
MISSING_CATEGORIES = {
    "Parking": {
        "queries": [
            'node["amenity"="parking"]',
            'way["amenity"="parking"]',
        ],
        "icon": "local_parking",
        "color": "#2196f3"
    },
    "Cinema": {
        "queries": [
            'node["amenity"="cinema"]',
            'way["amenity"="cinema"]',
        ],
        "icon": "local_movies",
        "color": "#e91e63"
    },
    "Fast Food": {
        "queries": [
            'node["amenity"="fast_food"]',
        ],
        "icon": "fastfood",
        "color": "#ff9800"
    },
    "Transport": {
        "queries": [
            'node["amenity"="taxi"]',
            'node["amenity"="car_rental"]',
            'node["amenity"="ferry_terminal"]',
        ],
        "icon": "directions_car",
        "color": "#00bcd4"
    },
    "Entertainment": {
        "queries": [
            'node["leisure"="amusement_arcade"]',
            'node["leisure"="bowling_alley"]',
            'node["leisure"="water_park"]',
            'node["amenity"="nightclub"]',
            'node["amenity"="casino"]',
            'node["amenity"="theatre"]',
            'way["amenity"="theatre"]',
        ],
        "icon": "attractions",
        "color": "#9c27b0"
    },
    "Nature": {
        "queries": [
            'node["leisure"="nature_reserve"]',
            'way["leisure"="nature_reserve"]',
            'node["tourism"="zoo"]',
            'way["tourism"="zoo"]',
            'node["leisure"="garden"]',
            'way["leisure"="garden"]',
        ],
        "icon": "nature",
        "color": "#4caf50"
    },
    "Sports": {
        "queries": [
            'node["leisure"="stadium"]',
            'way["leisure"="stadium"]',
            'node["leisure"="sports_centre"]',
            'way["leisure"="sports_centre"]',
            'node["leisure"="golf_course"]',
            'way["leisure"="golf_course"]',
        ],
        "icon": "sports",
        "color": "#ff5722"
    },
    "Airport": {
        "queries": [
            'node["aeroway"="aerodrome"]',
            'way["aeroway"="aerodrome"]',
        ],
        "icon": "flight",
        "color": "#607d8b"
    },
    "Government": {
        "queries": [
            'node["amenity"="townhall"]',
            'node["office"="government"]',
            'node["amenity"="courthouse"]',
        ],
        "icon": "account_balance",
        "color": "#795548"
    },
    "Landmark": {
        "queries": [
            'node["historic"="monument"]',
            'node["historic"="memorial"]',
            'node["tourism"="museum"]',
            'way["tourism"="museum"]',
            'node["historic"="castle"]',
        ],
        "icon": "location_city",
        "color": "#ff5722"
    },
    "Shopping": {
        "queries": [
            'node["shop"="department_store"]',
            'node["shop"="convenience"]',
            'node["shop"="clothes"]',
            'node["shop"="electronics"]',
        ],
        "icon": "shopping_bag",
        "color": "#e91e63"
    },
}

def get_city(lat, lng):
    cities = [
        ("Johannesburg", -26.5, -25.9, 27.7, 28.4),
        ("Pretoria", -26.0, -25.5, 28.0, 28.5),
        ("Cape Town", -34.3, -33.7, 18.2, 19.0),
        ("Durban", -30.1, -29.7, 30.8, 31.2),
        ("Port Elizabeth", -34.1, -33.8, 25.4, 26.0),
        ("Bloemfontein", -29.3, -29.0, 26.1, 26.4),
        ("East London", -33.1, -32.9, 27.8, 28.0),
        ("Polokwane", -24.0, -23.8, 29.4, 29.6),
    ]
    for city, lat_min, lat_max, lng_min, lng_max in cities:
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return city
    return "South Africa"

def fetch_region_data(query_parts, region_name, bbox):
    """Fetch POI data for a specific region"""
    south, west, north, east = bbox

    # Build query with all query parts
    query_union = "\n".join([f'{q}({south},{west},{north},{east});' for q in query_parts])

    overpass_query = f"""
    [out:json][timeout:120];
    (
      {query_union}
    );
    out center;
    """

    try:
        response = requests.post(OVERPASS_URL, data={"data": overpass_query}, timeout=130)
        response.raise_for_status()
        return response.json().get("elements", [])
    except Exception as e:
        print(f"      Error in {region_name}: {e}")
        return []

def import_category(cat_name, config, conn):
    """Import a single category across all regions"""
    cursor = conn.cursor()

    # Ensure category exists
    cursor.execute("""
        INSERT INTO poi_categories (name, icon, color)
        VALUES (%s, %s, %s)
        ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon, color = EXCLUDED.color
        RETURNING id
    """, (cat_name, config["icon"], config["color"]))
    cat_id = cursor.fetchone()[0]
    conn.commit()

    total_imported = 0

    for region_name, bbox in SA_REGIONS.items():
        print(f"    {region_name}...", end=" ", flush=True)

        elements = fetch_region_data(config["queries"], region_name, bbox)

        imported = 0
        for el in elements:
            tags = el.get("tags", {})
            name = tags.get("name") or tags.get("brand") or tags.get("operator")
            if not name:
                continue

            lat = el.get("lat") or el.get("center", {}).get("lat")
            lng = el.get("lon") or el.get("center", {}).get("lon")
            if not lat or not lng:
                continue

            city = get_city(lat, lng)
            phone = (tags.get("phone") or "")[:100] or None
            website = (tags.get("website") or "")[:500] or None
            opening_hours = tags.get("opening_hours")

            try:
                cursor.execute("""
                    INSERT INTO pois (name, category_id, latitude, longitude, city, phone, website, source, osm_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'osm', %s)
                    ON CONFLICT (name, latitude, longitude) DO UPDATE SET
                        category_id = EXCLUDED.category_id,
                        city = EXCLUDED.city,
                        updated_at = NOW()
                """, (name, cat_id, lat, lng, city, phone, website, el.get("id")))
                imported += 1
            except:
                conn.rollback()
                continue

        conn.commit()
        print(f"{imported} POIs")
        total_imported += imported
        time.sleep(1)  # Be nice to Overpass API

    return total_imported

def main():
    print("=" * 60)
    print("Missing POI Categories Importer")
    print("=" * 60)

    conn = psycopg2.connect(**DB_CONFIG)

    total = 0
    for cat_name, config in MISSING_CATEGORIES.items():
        print(f"\n[{cat_name}]")
        count = import_category(cat_name, config, conn)
        print(f"  Total: {count}")
        total += count
        time.sleep(2)

    print(f"\n{'=' * 60}")
    print(f"TOTAL IMPORTED: {total} POIs")
    print("=" * 60)

    # Show updated counts
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.name, COUNT(p.id)
        FROM poi_categories c
        LEFT JOIN pois p ON p.category_id = c.id
        GROUP BY c.name
        ORDER BY COUNT(p.id) DESC
    """)
    print("\nUpdated POI counts:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

    conn.close()

if __name__ == "__main__":
    main()
