from sqlalchemy import create_engine, text

DB_URL = "postgresql://openbb:openbb_pass@markets_db:5432/openbb_data"
engine = create_engine(DB_URL)

query = text("""
    WITH prices_et AS (
        SELECT symbol, close, asset_type, date,
            date AT TIME ZONE 'America/New_York' as date_et,
            DATE(date AT TIME ZONE 'America/New_York') as trade_date_et,
            ABS(EXTRACT(EPOCH FROM (date AT TIME ZONE 'America/New_York' -
                (DATE(date AT TIME ZONE 'America/New_York') + TIME '16:00:00')))) as seconds_from_close
        FROM stock_prices
        WHERE close IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '10 days' AND asset_type = 'EQUITY'
    ),
    daily_close AS (
        SELECT DISTINCT ON (symbol, trade_date_et)
            symbol, trade_date_et, close, asset_type
        FROM prices_et
        WHERE trade_date_et <= CURRENT_DATE
            AND asset_type IN ('CRYPTOCURRENCY', 'FUTURE', 'COMMODITY', 'EQUITY', 'ETF')
        ORDER BY symbol, trade_date_et DESC, seconds_from_close ASC
    ),
    ranked AS (
        SELECT symbol, trade_date_et as trade_date, close, asset_type,
               ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date_et DESC) as rn
        FROM daily_close
    )
    SELECT symbol, rn, trade_date, close
    FROM ranked
    WHERE symbol = 'TSLA' AND rn IN (1, 2)
    ORDER BY rn
""")

print("TSLA ranked dates:")
with engine.connect() as conn:
    result = conn.execute(query)
    for row in result.fetchall():
        print(f"  rn={row[1]}: date={row[2]}, close={row[3]}")
