#!/usr/bin/env python3
"""
OSM Opening Hours Importer for DataAcuity Maps
Imports opening_hours tags from OpenStreetMap and updates existing POIs
"""

import requests
import psycopg2
import json
import time
from typing import List, Dict, Any, Optional

# Database connection
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "maps",
    "user": "maps",
    "password": "maps_secret_2024"
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Categories that commonly have opening hours
CATEGORIES_WITH_HOURS = [
    "Restaurant", "Fast Food", "Cafe", "Supermarket", "Mall", "Shopping",
    "Pharmacy", "Hospital", "Clinic", "Bank", "ATM", "Post Office",
    "Fuel", "Car Wash", "Library", "Museum", "Cinema", "Gym"
]


def get_db_connection():
    """Create database connection"""
    return psycopg2.connect(**DB_CONFIG)


def parse_opening_hours(hours_str: str) -> Optional[Dict]:
    """
    Parse OSM opening_hours format into structured data.
    Examples:
    - "Mo-Fr 08:00-17:00"
    - "Mo-Fr 09:00-18:00; Sa 09:00-13:00"
    - "24/7"
    """
    if not hours_str:
        return None

    result = {
        "raw": hours_str,
        "days": {}
    }

    # Handle 24/7
    if hours_str.strip() == "24/7":
        for day in ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]:
            result["days"][day] = [{"open": "00:00", "close": "24:00"}]
        result["is_24_7"] = True
        return result

    # Parse semicolon-separated rules
    rules = hours_str.split(";")

    day_map = {
        "Mo": "Mo", "Tu": "Tu", "We": "We", "Th": "Th",
        "Fr": "Fr", "Sa": "Sa", "Su": "Su",
        "Monday": "Mo", "Tuesday": "Tu", "Wednesday": "We",
        "Thursday": "Th", "Friday": "Fr", "Saturday": "Sa", "Sunday": "Su"
    }

    for rule in rules:
        rule = rule.strip()
        if not rule:
            continue

        # Try to extract days and times
        parts = rule.split()
        if len(parts) >= 2:
            day_part = parts[0]
            time_part = " ".join(parts[1:])

            # Handle day ranges like "Mo-Fr"
            if "-" in day_part and ":" not in day_part:
                try:
                    start_day, end_day = day_part.split("-")
                    days_order = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

                    start_day = day_map.get(start_day.strip(), start_day.strip())
                    end_day = day_map.get(end_day.strip(), end_day.strip())

                    if start_day in days_order and end_day in days_order:
                        start_idx = days_order.index(start_day)
                        end_idx = days_order.index(end_day)

                        for i in range(start_idx, end_idx + 1):
                            day = days_order[i]
                            if day not in result["days"]:
                                result["days"][day] = []

                            # Parse time part
                            times = parse_time_range(time_part)
                            if times:
                                result["days"][day].append(times)
                except:
                    pass
            else:
                # Single day like "Sa"
                day = day_map.get(day_part.strip(), day_part.strip())
                if day in day_map.values():
                    if day not in result["days"]:
                        result["days"][day] = []
                    times = parse_time_range(time_part)
                    if times:
                        result["days"][day].append(times)

    return result if result["days"] else None


def parse_time_range(time_str: str) -> Optional[Dict]:
    """Parse time range like '08:00-17:00'"""
    time_str = time_str.strip().replace(" ", "")

    if "-" in time_str:
        try:
            parts = time_str.split("-")
            if len(parts) == 2:
                open_time = parts[0].strip()
                close_time = parts[1].strip()

                # Validate time format
                if ":" in open_time and ":" in close_time:
                    return {"open": open_time, "close": close_time}
        except:
            pass

    return None


def fetch_osm_opening_hours(bbox: str, category_filter: str = None) -> List[Dict]:
    """
    Fetch POIs with opening_hours from OSM via Overpass API.
    bbox format: "south,west,north,east" (e.g., "-35.0,16.0,-22.0,33.0" for South Africa)
    """

    # Build query for nodes with opening_hours
    query = f"""
    [out:json][timeout:120];
    (
        node["opening_hours"]({bbox});
        way["opening_hours"]({bbox});
    );
    out center meta;
    """

    try:
        print(f"Querying OSM for opening hours in bbox: {bbox}")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=180)
        response.raise_for_status()
        data = response.json()

        elements = data.get("elements", [])
        print(f"Found {len(elements)} POIs with opening hours")

        return elements
    except Exception as e:
        print(f"Error fetching from Overpass: {e}")
        return []


def update_poi_hours(conn, osm_id: str, opening_hours: str, parsed_hours: Dict):
    """Update POI with opening hours data"""

    with conn.cursor() as cur:
        # Try to find POI by OSM ID or by proximity
        cur.execute("""
            UPDATE pois
            SET
                metadata = COALESCE(metadata, '{}'::jsonb) ||
                    jsonb_build_object(
                        'opening_hours_raw', %s,
                        'opening_hours', %s,
                        'hours_updated_at', NOW()
                    )
            WHERE osm_id = %s
            RETURNING id
        """, (opening_hours, json.dumps(parsed_hours), osm_id))

        result = cur.fetchone()
        return result[0] if result else None


def match_and_update_by_location(conn, lat: float, lng: float, name: str,
                                  opening_hours: str, parsed_hours: Dict) -> Optional[int]:
    """
    Match POI by location and name, then update opening hours.
    Uses a 50m radius for matching.
    """

    with conn.cursor() as cur:
        # Find closest POI within 50m with similar name
        cur.execute("""
            UPDATE pois
            SET
                metadata = COALESCE(metadata, '{}'::jsonb) ||
                    jsonb_build_object(
                        'opening_hours_raw', %s,
                        'opening_hours', %s,
                        'hours_updated_at', NOW()
                    )
            WHERE id = (
                SELECT id FROM pois
                WHERE ST_DWithin(
                    geometry::geography,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                    50  -- 50 meter radius
                )
                AND (
                    LOWER(name) = LOWER(%s)
                    OR LOWER(name) LIKE LOWER(%s)
                )
                ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                LIMIT 1
            )
            RETURNING id
        """, (
            opening_hours, json.dumps(parsed_hours),
            lng, lat, name, f"%{name}%", lng, lat
        ))

        result = cur.fetchone()
        return result[0] if result else None


def import_opening_hours_for_region(region_name: str, bbox: str):
    """Import opening hours for a specific region"""

    print(f"\n{'='*60}")
    print(f"Importing opening hours for: {region_name}")
    print(f"Bounding box: {bbox}")
    print(f"{'='*60}")

    # Fetch from OSM
    elements = fetch_osm_opening_hours(bbox)

    if not elements:
        print("No POIs with opening hours found")
        return 0, 0

    conn = get_db_connection()
    updated = 0
    skipped = 0

    try:
        for elem in elements:
            tags = elem.get("tags", {})
            opening_hours = tags.get("opening_hours", "")
            name = tags.get("name", "")

            if not opening_hours or not name:
                skipped += 1
                continue

            # Get coordinates
            if elem["type"] == "node":
                lat = elem.get("lat")
                lng = elem.get("lon")
            else:
                # For ways, use center
                center = elem.get("center", {})
                lat = center.get("lat")
                lng = center.get("lon")

            if not lat or not lng:
                skipped += 1
                continue

            # Parse opening hours
            parsed = parse_opening_hours(opening_hours)

            # Try to update by OSM ID first
            osm_id = str(elem.get("id", ""))
            poi_id = update_poi_hours(conn, osm_id, opening_hours, parsed or {})

            if not poi_id:
                # Fall back to location matching
                poi_id = match_and_update_by_location(
                    conn, lat, lng, name, opening_hours, parsed or {}
                )

            if poi_id:
                updated += 1
                if updated % 100 == 0:
                    print(f"  Updated {updated} POIs...")
                    conn.commit()
            else:
                skipped += 1

        conn.commit()

    finally:
        conn.close()

    print(f"Updated: {updated}, Skipped: {skipped}")
    return updated, skipped


def main():
    """Main import function"""

    print("="*60)
    print("OSM Opening Hours Importer")
    print("="*60)

    # South Africa regions (broken up to avoid timeouts)
    regions = [
        ("Gauteng", "-26.5,27.5,-25.2,29.0"),
        ("Western Cape", "-34.5,18.0,-33.0,19.5"),
        ("Cape Town Metro", "-34.2,18.3,-33.7,18.9"),
        ("KwaZulu-Natal", "-30.5,29.0,-28.5,32.0"),
        ("Durban Metro", "-30.1,30.7,-29.7,31.1"),
        ("Eastern Cape", "-34.0,25.0,-31.5,28.5"),
        ("Free State", "-30.5,24.5,-28.0,29.5"),
        ("Mpumalanga", "-26.5,29.0,-24.5,32.0"),
        ("Limpopo", "-24.5,28.0,-22.5,31.5"),
        ("North West", "-27.5,24.0,-25.0,27.5"),
        ("Northern Cape", "-32.0,17.5,-28.0,24.5"),
    ]

    total_updated = 0
    total_skipped = 0

    for region_name, bbox in regions:
        updated, skipped = import_opening_hours_for_region(region_name, bbox)
        total_updated += updated
        total_skipped += skipped

        # Rate limiting
        print("Waiting 5 seconds before next region...")
        time.sleep(5)

    print("\n" + "="*60)
    print("IMPORT COMPLETE")
    print(f"Total Updated: {total_updated}")
    print(f"Total Skipped: {total_skipped}")
    print("="*60)


if __name__ == "__main__":
    main()
