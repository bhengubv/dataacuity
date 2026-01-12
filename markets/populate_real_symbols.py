#!/usr/bin/env python3
"""
Populate exchanges with REAL ticker symbols and their price data
"""
import psycopg2
import yfinance as yf
from datetime import datetime, timedelta
import time

DB_CONFIG = {
    'host': 'markets_db',
    'port': 5432,
    'database': 'openbb_data',
    'user': 'openbb',
    'password': 'openbb_pass'
}

# Real ticker symbols by exchange
REAL_TICKERS = {
    'NYSE': ['AAPL', 'MSFT', 'JPM', 'BAC', 'WFC', 'GE', 'T', 'VZ', 'XOM', 'CVX'],
    'NASDAQ': ['GOOGL', 'META', 'AMZN', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CSCO', 'NFLX', 'ADBE'],
    'AMEX': ['GLD', 'SLV', 'GDXJ', 'GLDM', 'IAU', 'SIVR', 'PPLT', 'PALL', 'UGL', 'AGQ'],
    'LSE': ['VOD.L', 'BP.L', 'HSBA.L', 'GSK.L', 'SHEL.L', 'AZN.L', 'RIO.L', 'ULVR.L', 'GLEN.L', 'DGE.L'],
    'JSE': ['AGL.JO', 'BTI.JO', 'SHP.JO', 'NPN.JO', 'CFR.JO', 'ANG.JO', 'ABG.JO', 'SBK.JO', 'FSR.JO', 'MTN.JO'],
}

def get_exchange_id(exchange_code):
    """Get exchange ID from code"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("SELECT id FROM exchanges WHERE code = %s", (exchange_code,))
    result = cur.fetchone()
    cur.close()
    conn.close()
    return result[0] if result else None

def add_or_update_symbol(exchange_code, ticker):
    """Add or update symbol in database"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    exchange_id = get_exchange_id(exchange_code)
    if not exchange_id:
        print(f"  ⚠️  Exchange {exchange_code} not found")
        return None
    
    # Check if symbol exists
    cur.execute("SELECT id FROM symbols WHERE symbol = %s", (ticker,))
    result = cur.fetchone()
    
    if result:
        symbol_id = result[0]
    else:
        # Insert new symbol
        cur.execute("""
            INSERT INTO symbols (symbol, name, exchange_id, category)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (ticker, ticker, exchange_id, 'stocks'))
        symbol_id = cur.fetchone()[0]
        conn.commit()
    
    cur.close()
    conn.close()
    return symbol_id

def fetch_and_store_prices(symbol_id, ticker):
    """Fetch and store price data"""
    try:
        yf_ticker = yf.Ticker(ticker)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        
        hist = yf_ticker.history(start=start_date, end=end_date)
        
        if hist.empty:
            print(f"  ⚠️  No data for {ticker}")
            return 0
        
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        inserted = 0
        for date, row in hist.iterrows():
            try:
                cur.execute("""
                    INSERT INTO stock_prices (symbol, date, open, high, low, close, volume, asset_type, symbol_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (symbol, date) DO UPDATE SET
                        open = EXCLUDED.open,
                        high = EXCLUDED.high,
                        low = EXCLUDED.low,
                        close = EXCLUDED.close,
                        volume = EXCLUDED.volume
                """, (
                    ticker,
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
                print(f"    Error: {e}")
                continue
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"  ✅ {ticker}: {inserted} records")
        return inserted
        
    except Exception as e:
        print(f"  ❌ {ticker}: {e}")
        return 0

def main():
    print("🚀 Populating with REAL ticker symbols...")
    print("=" * 60)
    
    total_inserted = 0
    
    for exchange_code, tickers in REAL_TICKERS.items():
        print(f"\n📍 {exchange_code}")
        print("-" * 40)
        
        for ticker in tickers:
            symbol_id = add_or_update_symbol(exchange_code, ticker)
            if symbol_id:
                inserted = fetch_and_store_prices(symbol_id, ticker)
                total_inserted += inserted
                time.sleep(1)  # Rate limiting
    
    print(f"\n" + "=" * 60)
    print(f"✅ Complete! Inserted {total_inserted} total records")
    print("=" * 60)

if __name__ == "__main__":
    main()
