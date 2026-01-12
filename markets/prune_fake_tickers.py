#!/usr/bin/env python3
"""
Remove fake placeholder tickers from the database
"""
import psycopg2

DB_CONFIG = {
    'host': 'markets_db',
    'port': 5432,
    'database': 'openbb_data',
    'user': 'openbb',
    'password': 'openbb_pass'
}

def main():
    print("🧹 PRUNING FAKE TICKER SYMBOLS")
    print("="*70)
    
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # First, check what we have
    print("\n📊 Current Status:")
    print("-"*70)
    
    cur.execute("""
        SELECT e.code, COUNT(s.id) as total
        FROM exchanges e
        LEFT JOIN symbols s ON s.exchange_id = e.id
        WHERE e.is_active = true
        GROUP BY e.code
        ORDER BY e.code
    """)
    
    before = {}
    for row in cur.fetchall():
        before[row[0]] = row[1]
        print(f"  {row[0]:<10} {row[1]:>4} symbols")
    
    # Identify fake tickers (patterns: AMEX0000, JSE0001, etc.)
    print("\n🔍 Identifying fake placeholder tickers...")
    print("-"*70)
    
    cur.execute("""
        SELECT COUNT(*) 
        FROM symbols 
        WHERE symbol ~ '^[A-Z]+[0-9]{4}$'  -- Matches: AMEX0000, JSE0001, etc.
        OR symbol ~ '^[A-Z]+[0-9]{4}\.(L|JO|TO|DE|PA|AX|HK|T)$'  -- With suffixes
    """)
    
    fake_count = cur.fetchone()[0]
    print(f"  Found {fake_count} fake placeholder tickers")
    
    if fake_count == 0:
        print("\n✅ No fake tickers found! Database is clean.")
        cur.close()
        conn.close()
        return
    
    # Show examples
    print("\n📋 Examples of fake tickers to be deleted:")
    cur.execute("""
        SELECT symbol, e.code
        FROM symbols s
        JOIN exchanges e ON s.exchange_id = e.id
        WHERE symbol ~ '^[A-Z]+[0-9]{4}$'
        OR symbol ~ '^[A-Z]+[0-9]{4}\.(L|JO|TO|DE|PA|AX|HK|T)$'
        ORDER BY random()
        LIMIT 10
    """)
    
    for row in cur.fetchall():
        print(f"    {row[1]:<10} {row[0]}")
    
    # Confirm deletion
    print(f"\n⚠️  This will DELETE {fake_count} fake ticker symbols")
    print("   (Price data for these symbols will also be removed)")
    print("\nProceed? This action cannot be undone.")
    
    # Auto-proceed for scripted execution
    print("Proceeding with cleanup...")
    
    # Delete in transaction
    print("\n🗑️  Deleting fake tickers...")
    print("-"*70)
    
    try:
        # First delete associated price data
        cur.execute("""
            DELETE FROM stock_prices
            WHERE symbol IN (
                SELECT symbol FROM symbols
                WHERE symbol ~ '^[A-Z]+[0-9]{4}$'
                OR symbol ~ '^[A-Z]+[0-9]{4}\.(L|JO|TO|DE|PA|AX|HK|T)$'
            )
        """)
        price_deleted = cur.rowcount
        print(f"  ✓ Deleted {price_deleted} price records")
        
        # Then delete the symbols
        cur.execute("""
            DELETE FROM symbols
            WHERE symbol ~ '^[A-Z]+[0-9]{4}$'
            OR symbol ~ '^[A-Z]+[0-9]{4}\.(L|JO|TO|DE|PA|AX|HK|T)$'
        """)
        symbols_deleted = cur.rowcount
        print(f"  ✓ Deleted {symbols_deleted} fake symbols")
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        print(f"  ❌ Error: {e}")
        cur.close()
        conn.close()
        return
    
    # Show after status
    print("\n📊 After Cleanup:")
    print("-"*70)
    
    cur.execute("""
        SELECT e.code, COUNT(s.id) as total
        FROM exchanges e
        LEFT JOIN symbols s ON s.exchange_id = e.id
        WHERE e.is_active = true
        GROUP BY e.code
        ORDER BY e.code
    """)
    
    after = {}
    for row in cur.fetchall():
        after[row[0]] = row[1]
        removed = before.get(row[0], 0) - row[1]
        status = f"(-{removed})" if removed > 0 else ""
        print(f"  {row[0]:<10} {row[1]:>4} symbols {status}")
    
    cur.close()
    conn.close()
    
    print("\n" + "="*70)
    print(f"✅ Cleanup complete!")
    print(f"   Deleted {symbols_deleted} fake symbols")
    print(f"   Deleted {price_deleted} associated price records")
    print("="*70)

if __name__ == "__main__":
    main()
