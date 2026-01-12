#!/usr/bin/env python3
"""
Pleiades Data Processor for DataAcuity Maps

This script:
1. Reads the Pleiades JSON dump
2. Extracts places with coordinates and historical names
3. Transforms data to match our schema
4. Splits into small batch files for safe, rate-limited import

Output: JSON batch files ready for n8n import workflow
"""

import json
import os
from datetime import datetime

# Configuration
INPUT_FILE = '/home/geektrading/maps/data/pleiades/pleiades-places-latest.json'
OUTPUT_DIR = '/home/geektrading/maps/data/pleiades/batches'
BATCH_SIZE = 100  # Places per batch - small for safety
SUMMARY_FILE = '/home/geektrading/maps/data/pleiades/import_summary.json'

# Pleiades time period to year mapping (approximate)
TIME_PERIODS = {
    'pre-pottery-neolithic-a': (-9500, -8500),
    'pre-pottery-neolithic-b': (-8500, -6000),
    'neolithic': (-6000, -3000),
    'early-bronze-age-mesopotamia': (-3100, -2000),
    'middle-bronze-age-mesopotamia': (-2000, -1600),
    'akkadian-ur-iii-background': (-2350, -2000),
    'neo-assyrian-babylonian-background': (-911, -539),
    'egyptian': (-3100, -30),
    'pharaonic': (-3100, -332),
    'archaic': (-750, -480),
    'classical': (-480, -330),
    'hellenistic-republican': (-330, -30),
    'roman': (-30, 300),
    'roman-early-empire': (-30, 96),
    'roman-middle-empire': (96, 284),
    'roman-late-empire': (284, 476),
    'late-antique': (300, 640),
    'mediaeval-byzantine': (640, 1453),
    'early-islamic-period': (640, 1050),
    'ottoman-rise': (1299, 1516),
    'modern': (1700, 2024),
    '1st-millennium-bce': (-1000, 0),
    '2nd-millennium-bce': (-2000, -1000),
    '3rd-millennium-bce': (-3000, -2000),
    '4th-millennium-bce': (-4000, -3000),
}

def get_year_range(time_period):
    """Convert Pleiades time period to year range"""
    period_key = time_period.lower().replace(' ', '-')
    if period_key in TIME_PERIODS:
        return TIME_PERIODS[period_key]
    # Try partial match
    for key, value in TIME_PERIODS.items():
        if key in period_key or period_key in key:
            return value
    return (None, None)

def extract_coordinates(place):
    """Get coordinates from place features or reprPoint"""
    # Try reprPoint first (representative point)
    if place.get('reprPoint'):
        return place['reprPoint']

    # Try features
    if place.get('features'):
        for feat in place['features']:
            if feat.get('geometry') and feat['geometry'].get('coordinates'):
                coords = feat['geometry']['coordinates']
                if feat['geometry']['type'] == 'Point':
                    return coords
                elif feat['geometry']['type'] == 'Polygon':
                    # Use centroid approximation
                    return coords[0][0] if coords and coords[0] else None

    return None

def transform_place(place):
    """Transform Pleiades place to our schema format"""
    coords = extract_coordinates(place)
    if not coords or len(coords) < 2:
        return None

    # Get time range from locations
    start_year = None
    end_year = None
    for loc in place.get('locations', []):
        if loc.get('start'):
            if start_year is None or loc['start'] < start_year:
                start_year = loc['start']
        if loc.get('end'):
            if end_year is None or loc['end'] > end_year:
                end_year = loc['end']
        # Also check attestations
        for att in loc.get('attestations', []):
            period_years = get_year_range(att.get('timePeriod', ''))
            if period_years[0] and (start_year is None or period_years[0] < start_year):
                start_year = period_years[0]
            if period_years[1] and (end_year is None or period_years[1] > end_year):
                end_year = period_years[1]

    # Extract place types
    place_types = place.get('placeTypes', [])
    place_type = place_types[0] if place_types else 'unknown'

    # Build our place record
    result = {
        'pleiades_id': place.get('id'),
        'pleiades_uri': place.get('uri'),
        'current_name': place.get('title', 'Unknown'),
        'lng': coords[0],
        'lat': coords[1],
        'place_type': place_type,
        'description': place.get('description', ''),
        'start_year': start_year,
        'end_year': end_year,
        'historical_names': []
    }

    # Extract historical names
    for name in place.get('names', []):
        name_start = None
        name_end = None

        # Get time range from attestations
        for att in name.get('attestations', []):
            period_years = get_year_range(att.get('timePeriod', ''))
            if period_years[0]:
                if name_start is None or period_years[0] < name_start:
                    name_start = period_years[0]
            if period_years[1]:
                if name_end is None or period_years[1] > name_end:
                    name_end = period_years[1]

        # Get the name text
        romanized = name.get('romanized', '')
        attested = name.get('attested', '')
        language = name.get('language', 'unknown')

        if romanized or attested:
            result['historical_names'].append({
                'name': romanized if romanized else attested,
                'name_native': attested if attested != romanized else None,
                'language': language,
                'year_start': name_start,
                'year_end': name_end,
                'source_title': 'Pleiades Gazetteer',
                'source_url': place.get('uri', '')
            })

    return result

def main():
    print(f"Loading Pleiades data from {INPUT_FILE}...")
    print(f"This may take a while for 1.6GB file...")

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    places = data.get('@graph', [])
    print(f"Found {len(places)} places in Pleiades data")

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Process and batch
    valid_places = []
    skipped = 0

    for i, place in enumerate(places):
        if i % 5000 == 0:
            print(f"Processing {i}/{len(places)}...")

        transformed = transform_place(place)
        if transformed:
            valid_places.append(transformed)
        else:
            skipped += 1

    print(f"\nValid places with coordinates: {len(valid_places)}")
    print(f"Skipped (no coordinates): {skipped}")

    # Count historical names
    total_names = sum(len(p['historical_names']) for p in valid_places)
    print(f"Total historical names: {total_names}")

    # Split into batches
    batches = []
    for i in range(0, len(valid_places), BATCH_SIZE):
        batch = valid_places[i:i + BATCH_SIZE]
        batch_num = len(batches) + 1
        batch_file = f"batch_{batch_num:04d}.json"
        batch_path = os.path.join(OUTPUT_DIR, batch_file)

        with open(batch_path, 'w', encoding='utf-8') as f:
            json.dump({
                'batch_number': batch_num,
                'total_in_batch': len(batch),
                'places': batch
            }, f, ensure_ascii=False, indent=2)

        batches.append({
            'file': batch_file,
            'count': len(batch)
        })

    print(f"\nCreated {len(batches)} batch files in {OUTPUT_DIR}")

    # Create summary
    summary = {
        'created_at': datetime.now().isoformat(),
        'source': 'Pleiades Gazetteer',
        'source_url': 'https://pleiades.stoa.org/',
        'total_places': len(valid_places),
        'total_historical_names': total_names,
        'skipped_no_coords': skipped,
        'batch_size': BATCH_SIZE,
        'total_batches': len(batches),
        'batches': batches,
        'recommended_delay_seconds': 120,
        'estimated_import_time_hours': (len(batches) * 120) / 3600
    }

    with open(SUMMARY_FILE, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"\nSummary saved to {SUMMARY_FILE}")
    print(f"Estimated import time at 120s delay: {summary['estimated_import_time_hours']:.1f} hours")
    print(f"\nReady for n8n import workflow!")

if __name__ == '__main__':
    main()
