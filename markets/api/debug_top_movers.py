import psycopg2
from sqlalchemy import create_engine, text

DB_URL = "postgresql://openbb:openbb_pass@markets_db:5432/openbb_data"
engine = create_engine(DB_URL)

# Test the stocks query
asset_type_filter = "AND asset_type = 'EQUITY'"

query = text(f"""
    WITH prices_et AS (
        SELECT
            symbol, close, asset_type, date,
            date AT TIME ZONE 'America/New_York' as date_et,
            DATE(date AT TIME ZONE 'America/New_York') as trade_date_et,
            ABS(EXTRACT(EPOCH FROM (date AT TIME ZONE 'America/New_York' -
                (DATE(date AT TIME ZONE 'America/New_York') + TIME '16:00:00')))) as seconds_from_close
        FROM stock_prices
        WHERE close IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '10 days' {asset_type_filter}
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
    SELECT curr.symbol, curr.close, prev.close, curr.asset_type,
           ROUND(((curr.close - prev.close) / prev.close * 100)::numeric, 2) as change_percent,
           curr.trade_date, prev.trade_date
    FROM ranked curr
    INNER JOIN ranked prev ON curr.symbol = prev.symbol AND prev.rn = 2
    WHERE curr.rn = 1 AND prev.close > 0 AND ABS(curr.close - prev.close) > 0.01
    ORDER BY change_percent DESC
""")

with engine.connect() as conn:
    result = conn.execute(query)
    print("Query Results:")
    for row in result:
        print(f"  {row}")
