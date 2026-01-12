#!/usr/bin/env python3
"""
Smart market data updater - checks DB state and updates incrementally
"""
import psycopg2
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
import time

DB_CONFIG = {
    'host': 'markets_db',
    'port': 5432,
    'database': 'openbb_data',
    'user': 'openbb',
    'password': 'openbb_pass'
}

def get_db_status():
    """Check current database state"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT 
            e.code,
            e.id,
            COUNT(DISTINCT s.id) as total_symbols,
            COUNT(DISTINCT CASE WHEN sp.id IS NOT NULL THEN s.id END) as symbols_with_prices,
            MAX(sp.date) as latest_price_date,
            COUNT(sp.id) as total_price_records
        FROM exchanges e
        LEFT JOIN symbols s ON s.exchange_id = e.id AND s.is_active = true
        LEFT JOIN stock_prices sp ON sp.symbol = s.symbol
        WHERE e.is_active = true
        GROUP BY e.code, e.id
        ORDER BY e.code
    """)
    
    status = {}
    for row in cur.fetchall():
        status[row[0]] = {
            'exchange_id': row[1],
            'total_symbols': row[2],
            'symbols_with_prices': row[3],
            'latest_date': row[4],
            'total_records': row[5]
        }
    
    cur.close()
    conn.close()
    return status

def get_symbols_needing_update(exchange_code, days_old=1):
    """Get symbols that need price updates - FIXED ORDER BY"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    cutoff_date = datetime.now() - timedelta(days=days_old)
    
    cur.execute("""
        SELECT s.id, s.symbol, COALESCE(sp.last_update, '1970-01-01'::timestamp) as last_update
        FROM symbols s
        JOIN exchanges e ON s.exchange_id = e.id
        LEFT JOIN (
            SELECT symbol, MAX(date) as last_update
            FROM stock_prices
            GROUP BY symbol
        ) sp ON sp.symbol = s.symbol
        WHERE e.code = %s 
        AND s.is_active = true
        AND (sp.last_update IS NULL OR sp.last_update < %s)
        ORDER BY last_update NULLS FIRST
    """, (exchange_code, cutoff_date))
    
    symbols = [(row[0], row[1]) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return symbols

def get_existing_tickers():
    """Get tickers already in DB to avoid fetching them from scratch"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT e.code, array_agg(s.symbol) as symbols
        FROM symbols s
        JOIN exchanges e ON s.exchange_id = e.id
        WHERE s.is_active = true 
        AND s.symbol NOT LIKE '%0000%'  -- Exclude fake placeholders
        AND s.symbol NOT LIKE '%0001%'
        GROUP BY e.code
    """)
    
    existing = {}
    for row in cur.fetchall():
        existing[row[0]] = row[1] if row[1] else []
    
    cur.close()
    conn.close()
    return existing

def expand_ticker_lists(existing):
    """Expand existing ticker lists with known good tickers"""
    expanded = {}
    
    # For NYSE - if we have some, just use what we have + a few more
    if 'NYSE' in existing and existing['NYSE']:
        expanded['NYSE'] = list(set(existing['NYSE'] + [
            'JPM', 'BAC', 'WFC', 'GS', 'MS', 'XOM', 'CVX', 'KO', 'PEP', 'JNJ'
        ]))
    else:
        expanded['NYSE'] = ['SPY', 'DIA', 'JPM', 'BAC', 'XOM', 'CVX', 'JNJ', 'PG', 'KO', 'PEP']
    
    # For NASDAQ
    if 'NASDAQ' in existing and existing['NASDAQ']:
        expanded['NASDAQ'] = list(set(existing['NASDAQ'] + [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC'
        ]))
    else:
        expanded['NASDAQ'] = ['QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA']
    
    # LSE
    expanded['LSE'] = [
        'AZN.L', 'SHEL.L', 'HSBA.L', 'ULVR.L', 'BP.L', 'GSK.L', 'DGE.L', 'VOD.L',
        'RIO.L', 'GLEN.L', 'BARC.L', 'LLOY.L', 'TSCO.L', 'SBRY.L'
    ]
    
    # JSE
    expanded['JSE'] = [
        'NPN.JO', 'PRX.JO', 'AGL.JO', 'BTI.JO', 'SHP.JO', 'SBK.JO', 'FSR.JO',
        'ABG.JO', 'NED.JO', 'AMS.JO', 'MTN.JO', 'VOD.JO', 'CFR.JO', 'SOL.JO'
    ]
    
    # TSX
    expanded['TSX'] = [
        'RY.TO', 'TD.TO', 'ENB.TO', 'BMO.TO', 'BNS.TO', 'CNR.TO', 'SU.TO',
        'CNQ.TO', 'MFC.TO', 'BCE.TO'
    ]
    
    # FWB (German)
    expanded['FWB'] = [
        'SAP.DE', 'SIE.DE', 'ALV.DE', 'DTE.DE', 'BAS.DE', 'BMW.DE', 'VOW3.DE'
    ]
    
    # CRYPTO
    expanded['CRYPTO'] = [
        'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'SOL-USD',
        'DOGE-USD', 'DOT-USD', 'MATIC-USD', 'AVAX-USD'
    ]
    
    # AMEX (ETFs)
    expanded['AMEX'] = [
        'SPY', 'QQQ', 'IWM', 'VTI', 'GLD', 'SLV', 'TLT', 'XLE', 'XLF', 'XLV',
        'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLK', 'XLRE', 'GDX', 'EEM', 'VNQ'
    ]
    
    return expanded

def add_missing_symbols(exchange_code, exchange_id, ticker_list):
    """Add symbols that don't exist yet"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    added = 0
    for ticker in ticker_list:
        try:
            cur.execute("""
                INSERT INTO symbols (symbol, name, exchange_id, category, is_active)
                VALUES (%s, %s, %s, %s, true)
                ON CONFLICT (symbol, exchange_id) DO NOTHING
                RETURNING id
            """, (ticker, ticker, exchange_id, 'crypto' if exchange_code == 'CRYPTO' else 'stocks'))
            
            if cur.fetchone():
                added += 1
        except:
            continue
    
    conn.commit()
    cur.close()
    conn.close()
    return added

def update_price_data(symbol_id, ticker, days_back=30):
    """Fetch and update price data"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        yf_ticker = yf.Ticker(ticker)
        hist = yf_ticker.history(start=start_date, end=end_date)
        
        if hist.empty:
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
                        open = EXCLUDED.open, high = EXCLUDED.high,
                        low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume
                """, (ticker, date, float(row['Open']), float(row['High']),
                      float(row['Low']), float(row['Close']), int(row['Volume']),
                      'CRYPTO' if '-USD' in ticker else 'EQUITY', symbol_id))
                inserted += 1
            except:
                continue
        
        conn.commit()
        cur.close()
        conn.close()
        return inserted
    except:
        return 0

def main():
    print("🔍 SMART MARKET DATA UPDATER")
    print("="*70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    # 1. Check current DB status
    print("\n📊 Current Database Status:")
    print("-"*70)
    status = get_db_status()
    
    for exchange, info in sorted(status.items()):
        latest = info['latest_date'].strftime('%Y-%m-%d') if info['latest_date'] else 'Never'
        print(f"  {exchange:<10} {info['symbols_with_prices']:>3}/{info['total_symbols']:<3} symbols | "
              f"{info['total_records']:>6} records | Latest: {latest}")
    
    # 2. Get existing tickers and expand
    print("\n🔍 Analyzing existing tickers...")
    print("-"*70)
    existing = get_existing_tickers()
    ticker_lists = expand_ticker_lists(existing)
    
    for exchange, tickers in ticker_lists.items():
        print(f"  {exchange:<10} {len(tickers):>3} tickers to ensure")
    
    # 3. Add missing symbols
    print("\n➕ Adding missing symbols...")
    print("-"*70)
    
    for exchange, tickers in ticker_lists.items():
        if exchange not in status:
            continue
        
        exchange_id = status[exchange]['exchange_id']
        added = add_missing_symbols(exchange, exchange_id, tickers)
        
        if added > 0:
            print(f"  {exchange:<10} +{added} new symbols")
        else:
            print(f"  {exchange:<10} All symbols exist ✓")
    
    # 4. Update price data
    print("\n📈 Updating price data...")
    print("-"*70)
    
    total_updated = 0
    for exchange in ticker_lists.keys():
        if exchange not in status:
            continue
        
        symbols = get_symbols_needing_update(exchange, days_old=1)
        
        if not symbols:
            print(f"  {exchange:<10} All up-to-date ✓")
            continue
        
        print(f"  {exchange:<10} Updating {len(symbols)} symbols...")
        
        updated = 0
        for symbol_id, ticker in symbols[:50]:  # Limit to 50 per exchange per run
            records = update_price_data(symbol_id, ticker, days_back=30)
            if records > 0:
                updated += 1
                total_updated += 1
            time.sleep(0.3)
        
        print(f"  {exchange:<10} Updated {updated} symbols ✓")
    
    # 5. Final status
    print("\n" + "="*70)
    print(f"✅ Update complete! Updated {total_updated} symbols with price data")
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)

if __name__ == "__main__":
    main()
