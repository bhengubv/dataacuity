#!/usr/bin/env python3
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

# GUARANTEED working tickers
GUARANTEED_TICKERS = {
    'NYSE': [
        'SPY', 'DIA', 'IWM', 'VTI', 'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS',
        'XOM', 'CVX', 'COP', 'JNJ', 'PFE', 'UNH', 'ABT', 'TMO', 'DHR',
        'WMT', 'HD', 'MCD', 'NKE', 'DIS', 'KO', 'PEP', 'PG', 'PM', 'MO'
    ],
    'NASDAQ': [
        'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA',
        'NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'ADBE', 'CRM', 'NFLX',
        'PYPL', 'CSCO', 'COST', 'SBUX'
    ],
    'AMEX': [
        'GLD', 'SLV', 'TLT', 'IEF', 'XLE', 'XLF', 'XLV', 'XLI', 'XLP',
        'XLY', 'XLU', 'XLB', 'XLK', 'XLRE', 'GDX', 'GDXJ', 'USO', 'VNQ'
    ],
    'CRYPTO': [
        'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'SOL-USD',
        'DOGE-USD', 'DOT-USD', 'MATIC-USD', 'AVAX-USD'
    ]
}

def clean_and_populate():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    print("🧹 Cleaning up and populating with GUARANTEED tickers...")
    print("="*70)
    
    total_added = 0
    total_prices = 0
    
    for exchange_code, tickers in GUARANTEED_TICKERS.items():
        print(f"\n📍 {exchange_code}")
        print("-"*70)
        
        # Get exchange ID
        cur.execute("SELECT id FROM exchanges WHERE code = %s", (exchange_code,))
        result = cur.fetchone()
        if not result:
            print(f"  ⚠️  Exchange not found")
            continue
        exchange_id = result[0]
        
        # Mark all existing symbols as inactive
        cur.execute("""
            UPDATE symbols SET is_active = false 
            WHERE exchange_id = %s
        """, (exchange_id,))
        conn.commit()
        
        # Add/activate guaranteed tickers
        added = 0
        for ticker in tickers:
            try:
                # Insert or update symbol (without category column)
                cur.execute("""
                    INSERT INTO symbols (symbol, name, exchange_id, is_active)
                    VALUES (%s, %s, %s, true)
                    ON CONFLICT (symbol, exchange_id) DO UPDATE 
                    SET is_active = true
                    RETURNING id
                """, (ticker, ticker, exchange_id))
                
                result = cur.fetchone()
                if not result:
                    print(f"  ⚠️  {ticker:<12} Failed to insert")
                    conn.rollback()
                    continue
                    
                symbol_id = result[0]
                conn.commit()
                
                # Fetch price data
                try:
                    yf_ticker = yf.Ticker(ticker)
                    end = datetime.now()
                    start = end - timedelta(days=365)
                    hist = yf_ticker.history(start=start, end=end)
                    
                    if not hist.empty:
                        inserted = 0
                        for date, row in hist.iterrows():
                            try:
                                cur.execute("""
                                    INSERT INTO stock_prices (symbol, date, open, high, low, close, volume, asset_type, symbol_id)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    ON CONFLICT (symbol, date) DO UPDATE SET
                                        open = EXCLUDED.open, high = EXCLUDED.high,
                                        low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume
                                """, (ticker, date, float(row['Open']), float(row['High']),
                                      float(row['Low']), float(row['Close']), int(row['Volume']),
                                      'CRYPTO' if '-USD' in ticker else 'EQUITY', symbol_id))
                                inserted += 1
                            except Exception as e:
                                conn.rollback()
                                conn.commit()  # Start fresh transaction
                                continue
                        
                        conn.commit()
                        if inserted > 0:
                            print(f"  ✅ {ticker:<12} {inserted} records")
                            added += 1
                            total_prices += inserted
                        else:
                            print(f"  ⚠️  {ticker:<12} No records inserted")
                    else:
                        print(f"  ⚠️  {ticker:<12} No data from yfinance")
                except Exception as e:
                    print(f"  ❌ {ticker:<12} {str(e)[:40]}")
                    conn.rollback()
                
                time.sleep(0.3)
                
            except Exception as e:
                print(f"  ❌ {ticker:<12} {str(e)[:40]}")
                conn.rollback()
                continue
        
        total_added += added
        print(f"\n  ✓ {exchange_code}: {added}/{len(tickers)} successful")
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*70}")
    print(f"✅ Complete! {total_added} symbols with {total_prices} price records")
    print("="*70)

if __name__ == "__main__":
    clean_and_populate()
