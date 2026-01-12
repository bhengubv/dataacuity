-- =============================================================================
-- Points of Interest (POI) Database for Fast Search
-- Pre-loaded common South African locations for instant autocomplete
-- =============================================================================

-- POI Categories
CREATE TABLE IF NOT EXISTS poi_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50),
    color VARCHAR(20),
    parent_id INTEGER REFERENCES poi_categories(id)
);

-- Main POI table
CREATE TABLE IF NOT EXISTS pois (
    id SERIAL PRIMARY KEY,

    -- Identity
    name VARCHAR(255) NOT NULL,
    name_alt VARCHAR(255),           -- Alternative name (Afrikaans, Zulu, etc.)

    -- Location
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    geometry GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,

    -- Classification
    category_id INTEGER REFERENCES poi_categories(id),
    subcategory VARCHAR(100),

    -- Address
    address VARCHAR(500),
    suburb VARCHAR(100),
    city VARCHAR(100),
    province VARCHAR(50),
    postal_code VARCHAR(10),

    -- Contact
    phone VARCHAR(50),
    website VARCHAR(500),

    -- Search optimization
    search_text TSVECTOR,
    popularity_score INTEGER DEFAULT 0,  -- Higher = appears first in results

    -- Metadata
    source VARCHAR(50) DEFAULT 'seed',   -- seed, osm, user, google
    osm_id BIGINT,
    verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_pois_geometry ON pois USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois(category_id);
CREATE INDEX IF NOT EXISTS idx_pois_city ON pois(city);
CREATE INDEX IF NOT EXISTS idx_pois_province ON pois(province);
CREATE INDEX IF NOT EXISTS idx_pois_popularity ON pois(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_pois_name_trgm ON pois USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pois_search ON pois USING GIN(search_text);

-- Update search text trigger
CREATE OR REPLACE FUNCTION update_poi_search_text()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_text :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.name_alt, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.suburb, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.city, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.address, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poi_search_text_trigger
BEFORE INSERT OR UPDATE ON pois
FOR EACH ROW EXECUTE FUNCTION update_poi_search_text();

-- Fast POI search function
CREATE OR REPLACE FUNCTION search_pois(
    search_term VARCHAR,
    category_filter VARCHAR DEFAULT NULL,
    lat DECIMAL DEFAULT NULL,
    lng DECIMAL DEFAULT NULL,
    radius_km INTEGER DEFAULT 50,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    poi_id INTEGER,
    name VARCHAR,
    category VARCHAR,
    latitude DECIMAL,
    longitude DECIMAL,
    address VARCHAR,
    city VARCHAR,
    distance_km DECIMAL,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        c.name AS category,
        p.latitude,
        p.longitude,
        p.address,
        p.city,
        CASE
            WHEN lat IS NOT NULL AND lng IS NOT NULL THEN
                ROUND((ST_Distance(
                    p.geometry::geography,
                    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
                ) / 1000)::DECIMAL, 2)
            ELSE NULL
        END AS distance_km,
        ts_rank(p.search_text, plainto_tsquery('english', search_term)) +
            (p.popularity_score::REAL / 1000) AS relevance
    FROM pois p
    LEFT JOIN poi_categories c ON p.category_id = c.id
    WHERE
        (
            p.name ILIKE '%' || search_term || '%'
            OR p.name_alt ILIKE '%' || search_term || '%'
            OR p.search_text @@ plainto_tsquery('english', search_term)
        )
        AND (category_filter IS NULL OR c.name = category_filter)
        AND (
            lat IS NULL OR lng IS NULL
            OR ST_DWithin(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
                radius_km * 1000
            )
        )
    ORDER BY
        relevance DESC,
        distance_km ASC NULLS LAST,
        p.popularity_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Nearby POIs function
CREATE OR REPLACE FUNCTION get_nearby_pois(
    lat DECIMAL,
    lng DECIMAL,
    category_filter VARCHAR DEFAULT NULL,
    radius_km INTEGER DEFAULT 5,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    poi_id INTEGER,
    name VARCHAR,
    category VARCHAR,
    subcategory VARCHAR,
    latitude DECIMAL,
    longitude DECIMAL,
    address VARCHAR,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        c.name AS category,
        p.subcategory,
        p.latitude,
        p.longitude,
        p.address,
        ROUND((ST_Distance(
            p.geometry::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ) / 1000)::DECIMAL, 2) AS distance_km
    FROM pois p
    LEFT JOIN poi_categories c ON p.category_id = c.id
    WHERE
        ST_DWithin(
            p.geometry::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
            radius_km * 1000
        )
        AND (category_filter IS NULL OR c.name = category_filter)
    ORDER BY distance_km ASC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
