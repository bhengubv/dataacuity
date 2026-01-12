#!/usr/bin/env python3
"""
Fresh start - keep only symbols with price data, delete everything else
"""
import psycopg2

DB_CONFIG = {
    'host': 'markets_db',
    'port': 5432,
    'database': 'openbb_data',
    'user': 'openbb',
    'password': 'openbb_pass'
}

def fresh_start():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    print("🔄 FRESH START - Keeping only working symbols")
    print("="*70)
    
    # 1. Check what has price data
    print("\n📊 Symbols with price data (KEEPING):")
    print("-"*70)
    
    cur.execute("""
        SELECT e.code, COUNT(DISTINCT s.symbol) as count
        FROM symbols s
        JOIN exchanges e ON s.exchange_id = e.id
        JOIN stock_prices sp ON sp.symbol = s.symbol
        GROUP BY e.code
        ORDER BY e.code
    """)
    
    keepers = {}
    for row in cur.fetchall():
        keepers[row[0]] = row[1]
        print(f"  {row[0]:<10} {row[1]:>3} symbols with price data")
    
    # 2. Delete symbols WITHOUT price data
    print("\n🗑️  Deleting symbols without price data...")
    print("-"*70)
    
    cur.execute("""
        DELETE FROM symbols
        WHERE id NOT IN (
            SELECT DISTINCT s.id
            FROM symbols s
            JOIN stock_prices sp ON sp.symbol = s.symbol
        )
    """)
    
    deleted = cur.rowcount
    conn.commit()
    print(f"  ✓ Deleted {deleted} symbols without price data")
    
    # 3. Show final clean state
    print("\n📊 Clean Database State:")
    print("-"*70)
    
    cur.execute("""
        SELECT 
            e.code,
            COUNT(DISTINCT s.id) as symbols,
            COUNT(sp.id) as price_records,
            MAX(sp.date) as latest_date
        FROM exchanges e
        LEFT JOIN symbols s ON s.exchange_id = e.id AND s.is_active = true
        LEFT JOIN stock_prices sp ON sp.symbol = s.symbol
        WHERE e.is_active = true
        GROUP BY e.code
        HAVING COUNT(DISTINCT s.id) > 0
        ORDER BY symbols DESC
    """)
    
    for row in cur.fetchall():
        latest = row[3].strftime('%Y-%m-%d') if row[3] else 'N/A'
        print(f"  {row[0]:<10} {row[1]:>3} symbols | {row[2]:>6} records | {latest}")
    
    cur.close()
    conn.close()
    
    print("\n" + "="*70)
    print("✅ Database cleaned! Only working symbols remain.")
    print("="*70)

if __name__ == "__main__":
    fresh_start()
