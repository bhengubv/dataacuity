#!/usr/bin/env python3
"""
Populate stock_prices for all exchanges using yfinance
"""
import psycopg2
import yfinance as yf
from datetime import datetime, timedelta
import time

# Database connection - use Docker hostname
DB_CONFIG = {
    'host': 'markets_db',  # Changed from localhost
    'port': 5432,
    'database': 'openbb_data',
    'user': 'openbb',
    'password': 'openbb_pass'
}

def get_symbols_by_exchange():
    """Get all symbols grouped by exchange"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT s.id, s.symbol, s.exchange_id, e.code as exchange_code
        FROM symbols s
        JOIN exchanges e ON s.exchange_id = e.id
        WHERE s.symbol NOT LIKE '%.JO'
        AND e.code IN ('NYSE', 'NASDAQ', 'AMEX', 'LSE', 'TSE', 'FWB')
        ORDER BY e.code, s.symbol
        LIMIT 100;
    """)
    
    results = cur.fetchall()
    cur.close()
    conn.close()
    
    return results

def fetch_and_store_prices(symbol_id, symbol, exchange_code):
    """Fetch historical prices and store in database"""
    try:
        ticker = yf.Ticker(symbol)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        
        hist = ticker.history(start=start_date, end=end_date)
        
        if hist.empty:
            print(f"  ⚠️  No data for {symbol}")
            return 0
        
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        inserted = 0
        for date, row in hist.iterrows():
            try:
                cur.execute("""
                    INSERT INTO stock_prices (symbol, date, open, high, low, close, volume, asset_type, symbol_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (symbol, date) DO NOTHING
                """, (
                    symbol,
                    date,
                    float(row['Open']),
                    float(row['High']),
                    float(row['Low']),
                    float(row['Close']),
                    int(row['Volume']),
                    'EQUITY',
                    symbol_id
                ))
                inserted += 1
            except Exception as e:
                print(f"    Error inserting {symbol} {date}: {e}")
                continue
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"  ✅ {symbol}: {inserted} records")
        return inserted
        
    except Exception as e:
        print(f"  ❌ {symbol}: {e}")
        return 0

def main():
    print("🚀 Starting data population...")
    print("=" * 60)
    
    symbols = get_symbols_by_exchange()
    print(f"\n📊 Found {len(symbols)} symbols to process\n")
    
    total_inserted = 0
    current_exchange = None
    
    for symbol_id, symbol, exchange_id, exchange_code in symbols:
        if current_exchange != exchange_code:
            current_exchange = exchange_code
            print(f"\n📍 {exchange_code}")
            print("-" * 40)
        
        inserted = fetch_and_store_prices(symbol_id, symbol, exchange_code)
        total_inserted += inserted
        
        time.sleep(0.5)
    
    print(f"\n" + "=" * 60)
    print(f"✅ Complete! Inserted {total_inserted} total records")
    print("=" * 60)

if __name__ == "__main__":
    main()
