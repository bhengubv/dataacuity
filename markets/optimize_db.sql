-- ============================================
-- STEP 1: Add Composite Indexes
-- ============================================
-- For sentiment query (date + symbol lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_prices_date_symbol 
ON stock_prices(date DESC, symbol);

-- For asset_type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_prices_asset_date 
ON stock_prices(asset_type, date DESC) 
WHERE close IS NOT NULL;

-- For latest price lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_prices_symbol_date_desc 
ON stock_prices(symbol, date DESC) 
WHERE close IS NOT NULL;

-- ============================================
-- STEP 2: Create Materialized Views
-- ============================================
-- Pre-computed sentiment (refresh every 5 min)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_market_sentiment AS
WITH latest_prices AS (
    SELECT DISTINCT ON (symbol)
        symbol, close as current_price, asset_type, date
    FROM stock_prices
    WHERE close IS NOT NULL 
    AND date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY symbol, date DESC
),
previous_day AS (
    SELECT symbol, MAX(DATE(date)) as prev_date
    FROM stock_prices
    WHERE DATE(date) < CURRENT_DATE
    AND date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY symbol
),
day_ago_prices AS (
    SELECT DISTINCT ON (sp.symbol)
        sp.symbol, sp.close as previous_price
    FROM stock_prices sp
    INNER JOIN previous_day pd ON sp.symbol = pd.symbol AND DATE(sp.date) = pd.prev_date
    WHERE sp.close IS NOT NULL
    ORDER BY sp.symbol, sp.date DESC
)
SELECT lp.symbol, lp.asset_type,
       ROUND(((lp.current_price - pp.previous_price) / pp.previous_price * 100)::numeric, 2) as change_percent
FROM latest_prices lp
INNER JOIN day_ago_prices pp ON lp.symbol = pp.symbol
WHERE pp.previous_price > 0;

CREATE UNIQUE INDEX ON mv_market_sentiment(symbol);

-- ============================================
-- STEP 3: Archive Old Data
-- ============================================
-- Create archive table for data >6 months old
CREATE TABLE IF NOT EXISTS stock_prices_archive (
    LIKE stock_prices INCLUDING ALL
);

-- Move old data to archive (run monthly)
-- INSERT INTO stock_prices_archive 
-- SELECT * FROM stock_prices 
-- WHERE date < CURRENT_DATE - INTERVAL '6 months';
-- DELETE FROM stock_prices 
-- WHERE date < CURRENT_DATE - INTERVAL '6 months';

-- ============================================
-- STEP 4: Set Up Auto-Vacuum
-- ============================================
ALTER TABLE stock_prices SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- ============================================
-- STEP 5: Create Refresh Function
-- ============================================
CREATE OR REPLACE FUNCTION refresh_market_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_market_sentiment;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON mv_market_sentiment TO openbb;
GRANT EXECUTE ON FUNCTION refresh_market_views() TO openbb;
