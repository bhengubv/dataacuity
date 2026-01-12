-- ============================================
-- EXCHANGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS exchanges (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    timezone VARCHAR(50),
    trading_hours JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed major exchanges
INSERT INTO exchanges (code, name, country, timezone) VALUES
('NYSE', 'New York Stock Exchange', 'USA', 'America/New_York'),
('NASDAQ', 'NASDAQ', 'USA', 'America/New_York'),
('LSE', 'London Stock Exchange', 'UK', 'Europe/London'),
('JSE', 'Johannesburg Stock Exchange', 'South Africa', 'Africa/Johannesburg'),
('TSE', 'Tokyo Stock Exchange', 'Japan', 'Asia/Tokyo'),
('SSE', 'Shanghai Stock Exchange', 'China', 'Asia/Shanghai'),
('CRYPTO', 'Cryptocurrency', 'Global', 'UTC')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- SYMBOLS TABLE (Metadata)
-- ============================================
CREATE TABLE IF NOT EXISTS symbols (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),
    name VARCHAR(200),
    sector VARCHAR(100),
    industry VARCHAR(100),
    asset_type VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    first_trade_date DATE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    UNIQUE(symbol, exchange_id)
);

CREATE INDEX IF NOT EXISTS idx_symbols_active ON symbols(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_symbols_exchange ON symbols(exchange_id);
CREATE INDEX IF NOT EXISTS idx_symbols_asset_type ON symbols(asset_type);
CREATE INDEX IF NOT EXISTS idx_symbols_sector ON symbols(sector);

-- Migrate existing data to symbols table
INSERT INTO symbols (symbol, asset_type, is_active)
SELECT DISTINCT symbol, asset_type, true
FROM stock_prices
WHERE symbol IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================
-- UPDATE STOCK_PRICES WITH FOREIGN KEY
-- ============================================
ALTER TABLE stock_prices ADD COLUMN IF NOT EXISTS symbol_id INTEGER;

-- Create mapping
UPDATE stock_prices sp
SET symbol_id = s.id
FROM symbols s
WHERE sp.symbol = s.symbol AND sp.symbol_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol_id ON stock_prices(symbol_id);

-- ============================================
-- MATERIALIZED VIEWS FOR METADATA
-- ============================================
-- Active symbols with latest price
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_active_symbols AS
SELECT 
    s.id,
    s.symbol,
    s.name,
    s.exchange_id,
    e.code as exchange_code,
    e.name as exchange_name,
    s.asset_type,
    s.sector,
    s.industry,
    MAX(sp.date) as last_trade_date,
    COUNT(sp.id) as price_records
FROM symbols s
LEFT JOIN exchanges e ON s.exchange_id = e.id
LEFT JOIN stock_prices sp ON s.id = sp.symbol_id
WHERE s.is_active = true
GROUP BY s.id, s.symbol, s.name, s.exchange_id, e.code, e.name, s.asset_type, s.sector, s.industry;

CREATE UNIQUE INDEX ON mv_active_symbols(id);
CREATE INDEX ON mv_active_symbols(exchange_code);
CREATE INDEX ON mv_active_symbols(asset_type);

-- ============================================
-- PARTITIONING FOR SCALE (PostgreSQL 11+)
-- ============================================
-- Note: This would require recreating the table
-- For now, we'll add a comment for future migration
COMMENT ON TABLE stock_prices IS 'TODO: Migrate to partitioned table by date range (monthly) when data exceeds 50M rows';

-- ============================================
-- PERFORMANCE VIEWS
-- ============================================
-- Latest prices per symbol (updated every 5 min)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_latest_prices AS
SELECT DISTINCT ON (sp.symbol_id)
    sp.symbol_id,
    s.symbol,
    s.name,
    s.exchange_id,
    sp.close as price,
    sp.volume,
    sp.date as price_date,
    s.asset_type,
    s.currency
FROM stock_prices sp
JOIN symbols s ON sp.symbol_id = s.id
WHERE sp.close IS NOT NULL
  AND sp.date >= CURRENT_DATE - INTERVAL '7 days'
  AND s.is_active = true
ORDER BY sp.symbol_id, sp.date DESC;

CREATE UNIQUE INDEX ON mv_latest_prices(symbol_id);
CREATE INDEX ON mv_latest_prices(exchange_id);
CREATE INDEX ON mv_latest_prices(asset_type);

-- ============================================
-- REFRESH FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION refresh_all_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_market_sentiment;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_active_symbols;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_prices;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION refresh_all_views() TO openbb;
