#!/usr/bin/env python3
"""
Load admin division lookup data from GeoNames files
"""

import psycopg2
import os

# Database connection
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'maps',
    'user': 'maps',
    'password': os.environ.get('MAPS_DB_PASSWORD', 'maps_secret_2024')
}

DATA_DIR = '/home/geektrading/maps/data/geonames'

# Continent mapping based on country code
CONTINENT_MAP = {
    'AF': 'Africa', 'AX': 'Europe', 'AL': 'Europe', 'DZ': 'Africa', 'AS': 'Oceania',
    'AD': 'Europe', 'AO': 'Africa', 'AI': 'North America', 'AQ': 'Antarctica',
    'AG': 'North America', 'AR': 'South America', 'AM': 'Asia', 'AW': 'North America',
    'AU': 'Oceania', 'AT': 'Europe', 'AZ': 'Asia', 'BS': 'North America',
    'BH': 'Asia', 'BD': 'Asia', 'BB': 'North America', 'BY': 'Europe',
    'BE': 'Europe', 'BZ': 'North America', 'BJ': 'Africa', 'BM': 'North America',
    'BT': 'Asia', 'BO': 'South America', 'BA': 'Europe', 'BW': 'Africa',
    'BR': 'South America', 'BN': 'Asia', 'BG': 'Europe', 'BF': 'Africa',
    'BI': 'Africa', 'KH': 'Asia', 'CM': 'Africa', 'CA': 'North America',
    'CV': 'Africa', 'KY': 'North America', 'CF': 'Africa', 'TD': 'Africa',
    'CL': 'South America', 'CN': 'Asia', 'CO': 'South America', 'KM': 'Africa',
    'CG': 'Africa', 'CD': 'Africa', 'CR': 'North America', 'CI': 'Africa',
    'HR': 'Europe', 'CU': 'North America', 'CY': 'Europe', 'CZ': 'Europe',
    'DK': 'Europe', 'DJ': 'Africa', 'DM': 'North America', 'DO': 'North America',
    'EC': 'South America', 'EG': 'Africa', 'SV': 'North America', 'GQ': 'Africa',
    'ER': 'Africa', 'EE': 'Europe', 'ET': 'Africa', 'FJ': 'Oceania',
    'FI': 'Europe', 'FR': 'Europe', 'GA': 'Africa', 'GM': 'Africa',
    'GE': 'Asia', 'DE': 'Europe', 'GH': 'Africa', 'GR': 'Europe',
    'GL': 'North America', 'GD': 'North America', 'GT': 'North America',
    'GN': 'Africa', 'GW': 'Africa', 'GY': 'South America', 'HT': 'North America',
    'HN': 'North America', 'HK': 'Asia', 'HU': 'Europe', 'IS': 'Europe',
    'IN': 'Asia', 'ID': 'Asia', 'IR': 'Asia', 'IQ': 'Asia', 'IE': 'Europe',
    'IL': 'Asia', 'IT': 'Europe', 'JM': 'North America', 'JP': 'Asia',
    'JO': 'Asia', 'KZ': 'Asia', 'KE': 'Africa', 'KI': 'Oceania',
    'KP': 'Asia', 'KR': 'Asia', 'KW': 'Asia', 'KG': 'Asia', 'LA': 'Asia',
    'LV': 'Europe', 'LB': 'Asia', 'LS': 'Africa', 'LR': 'Africa',
    'LY': 'Africa', 'LI': 'Europe', 'LT': 'Europe', 'LU': 'Europe',
    'MO': 'Asia', 'MK': 'Europe', 'MG': 'Africa', 'MW': 'Africa',
    'MY': 'Asia', 'MV': 'Asia', 'ML': 'Africa', 'MT': 'Europe',
    'MH': 'Oceania', 'MR': 'Africa', 'MU': 'Africa', 'MX': 'North America',
    'FM': 'Oceania', 'MD': 'Europe', 'MC': 'Europe', 'MN': 'Asia',
    'ME': 'Europe', 'MA': 'Africa', 'MZ': 'Africa', 'MM': 'Asia',
    'NA': 'Africa', 'NR': 'Oceania', 'NP': 'Asia', 'NL': 'Europe',
    'NZ': 'Oceania', 'NI': 'North America', 'NE': 'Africa', 'NG': 'Africa',
    'NO': 'Europe', 'OM': 'Asia', 'PK': 'Asia', 'PW': 'Oceania',
    'PS': 'Asia', 'PA': 'North America', 'PG': 'Oceania', 'PY': 'South America',
    'PE': 'South America', 'PH': 'Asia', 'PL': 'Europe', 'PT': 'Europe',
    'PR': 'North America', 'QA': 'Asia', 'RO': 'Europe', 'RU': 'Europe',
    'RW': 'Africa', 'SA': 'Asia', 'SN': 'Africa', 'RS': 'Europe',
    'SC': 'Africa', 'SL': 'Africa', 'SG': 'Asia', 'SK': 'Europe',
    'SI': 'Europe', 'SB': 'Oceania', 'SO': 'Africa', 'ZA': 'Africa',
    'SS': 'Africa', 'ES': 'Europe', 'LK': 'Asia', 'SD': 'Africa',
    'SR': 'South America', 'SZ': 'Africa', 'SE': 'Europe', 'CH': 'Europe',
    'SY': 'Asia', 'TW': 'Asia', 'TJ': 'Asia', 'TZ': 'Africa',
    'TH': 'Asia', 'TL': 'Asia', 'TG': 'Africa', 'TO': 'Oceania',
    'TT': 'North America', 'TN': 'Africa', 'TR': 'Asia', 'TM': 'Asia',
    'TV': 'Oceania', 'UG': 'Africa', 'UA': 'Europe', 'AE': 'Asia',
    'GB': 'Europe', 'US': 'North America', 'UY': 'South America',
    'UZ': 'Asia', 'VU': 'Oceania', 'VE': 'South America', 'VN': 'Asia',
    'YE': 'Asia', 'ZM': 'Africa', 'ZW': 'Africa'
}

def load_countries(cursor):
    """Load countries from countryInfo.txt"""
    filepath = os.path.join(DATA_DIR, 'countryInfo.txt')
    count = 0

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#'):
                continue
            parts = line.strip().split('\t')
            if len(parts) < 5:
                continue

            code = parts[0]
            name = parts[4]
            continent = CONTINENT_MAP.get(code, 'Unknown')

            try:
                cursor.execute("""
                    INSERT INTO countries (code, name, continent)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, continent = EXCLUDED.continent
                """, (code, name, continent))
                count += 1
            except Exception as e:
                print(f"Error inserting country {code}: {e}")

    return count

def load_admin1(cursor):
    """Load admin1 divisions from admin1CodesASCII.txt"""
    filepath = os.path.join(DATA_DIR, 'admin1CodesASCII.txt')
    count = 0

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) < 4:
                continue

            code = parts[0]  # e.g., "ZA.06"
            name = parts[1]
            geoname_id = int(parts[3]) if parts[3] else None
            country_code = code.split('.')[0] if '.' in code else None

            try:
                cursor.execute("""
                    INSERT INTO admin1_divisions (code, country_code, name, geoname_id)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                """, (code, country_code, name, geoname_id))
                count += 1
            except Exception as e:
                print(f"Error inserting admin1 {code}: {e}")

    return count

def load_admin2(cursor):
    """Load admin2 divisions from admin2Codes.txt"""
    filepath = os.path.join(DATA_DIR, 'admin2Codes.txt')
    count = 0

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) < 4:
                continue

            code = parts[0]  # e.g., "ZA.06.JHB"
            name = parts[1]
            geoname_id = int(parts[3]) if parts[3] else None

            code_parts = code.split('.')
            country_code = code_parts[0] if len(code_parts) > 0 else None
            admin1_code = f"{code_parts[0]}.{code_parts[1]}" if len(code_parts) > 1 else None

            try:
                cursor.execute("""
                    INSERT INTO admin2_divisions (code, country_code, admin1_code, name, geoname_id)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                """, (code, country_code, admin1_code, name, geoname_id))
                count += 1
            except Exception as e:
                print(f"Error inserting admin2 {code}: {e}")

    return count

def main():
    print("Loading admin division data...")

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    try:
        # Load countries
        print("Loading countries...")
        country_count = load_countries(cursor)
        print(f"  Loaded {country_count} countries")

        # Load admin1 (provinces/states)
        print("Loading admin1 divisions (provinces/states)...")
        admin1_count = load_admin1(cursor)
        print(f"  Loaded {admin1_count} admin1 divisions")

        # Load admin2 (cities/districts)
        print("Loading admin2 divisions (cities/districts)...")
        admin2_count = load_admin2(cursor)
        print(f"  Loaded {admin2_count} admin2 divisions")

        conn.commit()
        print("\nDone! Admin data loaded successfully.")

        # Show some South African examples
        cursor.execute("""
            SELECT a1.code, a1.name, c.name as country
            FROM admin1_divisions a1
            JOIN countries c ON a1.country_code = c.code
            WHERE a1.country_code = 'ZA'
        """)
        print("\nSouth African provinces:")
        for row in cursor.fetchall():
            print(f"  {row[0]}: {row[1]}, {row[2]}")

    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
