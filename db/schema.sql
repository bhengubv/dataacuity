-- DataAcuity Historical Maps Database Schema
-- "Navigate Time & Space"
--
-- This schema supports:
-- - Current geographic data (OSM-compatible)
-- - Historical place names with date ranges
-- - Historical boundaries (empires, kingdoms, regions)
-- - Events tied to places and times
-- - Crowdsourced contributions with source citations
-- - Multi-language support including ancient scripts

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text search

-- ============================================
-- CORE TABLES
-- ============================================

-- Places: The core geographic entities
CREATE TABLE places (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,

    -- Current/primary name
    current_name VARCHAR(255) NOT NULL,
    current_name_language VARCHAR(10) DEFAULT 'en',

    -- Geographic data
    geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,  -- Supports Point, Polygon, LineString
    place_type VARCHAR(50) NOT NULL,  -- city, town, village, river, mountain, region, building, etc.

    -- OSM compatibility
    osm_id BIGINT,
    osm_type VARCHAR(10),  -- node, way, relation

    -- Metadata
    population INTEGER,
    elevation_m INTEGER,
    timezone VARCHAR(50),
    country_code VARCHAR(3),

    -- Crowdsourcing
    created_by INTEGER REFERENCES users(id),
    verified BOOLEAN DEFAULT FALSE,
    verified_by INTEGER REFERENCES users(id),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Historical names for places
CREATE TABLE place_names (
    id SERIAL PRIMARY KEY,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,

    -- The historical name
    name VARCHAR(255) NOT NULL,
    name_native VARCHAR(255),  -- In original script (Hebrew, Arabic, etc.)
    language VARCHAR(50),      -- Language/culture of the name
    language_code VARCHAR(10), -- ISO 639 code

    -- Time period (negative years = BCE)
    year_start INTEGER,        -- NULL means "from ancient times"
    year_end INTEGER,          -- NULL means "still in use"
    year_accuracy VARCHAR(20) DEFAULT 'exact',  -- exact, approximate, century, millennium

    -- Context
    name_type VARCHAR(50) DEFAULT 'official',  -- official, colloquial, colonial, indigenous, religious
    used_by VARCHAR(100),      -- "Romans", "Zulu people", "British Empire", etc.

    -- Source citation (critical for historical accuracy)
    source_type VARCHAR(50),   -- book, inscription, map, oral_history, academic_paper
    source_title VARCHAR(500),
    source_author VARCHAR(255),
    source_year INTEGER,
    source_url TEXT,
    source_page VARCHAR(50),

    -- Crowdsourcing
    contributed_by INTEGER REFERENCES users(id),
    verified BOOLEAN DEFAULT FALSE,
    verification_notes TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Historical boundaries (empires, kingdoms, regions)
CREATE TABLE boundaries (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,

    -- Identity
    name VARCHAR(255) NOT NULL,
    name_native VARCHAR(255),
    boundary_type VARCHAR(50),  -- empire, kingdom, province, tribe_territory, religious_region

    -- Geographic extent
    geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,

    -- Time period
    year_start INTEGER NOT NULL,
    year_end INTEGER,           -- NULL means still exists
    year_accuracy VARCHAR(20) DEFAULT 'approximate',

    -- Context
    parent_boundary_id INTEGER REFERENCES boundaries(id),  -- For nested regions
    capital_place_id INTEGER REFERENCES places(id),

    -- Source citation
    source_type VARCHAR(50),
    source_title VARCHAR(500),
    source_author VARCHAR(255),
    source_url TEXT,

    -- Metadata
    description TEXT,
    wikipedia_url TEXT,

    -- Crowdsourcing
    contributed_by INTEGER REFERENCES users(id),
    verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Historical events tied to places
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,

    -- Event details
    name VARCHAR(500) NOT NULL,
    description TEXT,
    event_type VARCHAR(50),  -- battle, founding, destruction, treaty, religious, migration

    -- Time
    year INTEGER NOT NULL,       -- Negative for BCE
    month INTEGER,               -- 1-12, NULL if unknown
    day INTEGER,                 -- 1-31, NULL if unknown
    year_accuracy VARCHAR(20) DEFAULT 'exact',

    -- Location
    place_id INTEGER REFERENCES places(id),
    geometry GEOMETRY(POINT, 4326),  -- Can override place geometry for specific event location

    -- Categories/tags
    categories TEXT[],           -- ['biblical', 'military', 'political']

    -- Source citation
    source_type VARCHAR(50),
    source_title VARCHAR(500),
    source_author VARCHAR(255),
    source_url TEXT,

    -- Related content
    wikipedia_url TEXT,
    image_url TEXT,

    -- Crowdsourcing
    contributed_by INTEGER REFERENCES users(id),
    verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- USER & CONTRIBUTION SYSTEM
-- ============================================

-- Users (can link to DataAcuity auth later)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,

    -- Identity
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,

    -- External auth
    dataacuity_user_id VARCHAR(255),
    keycloak_id VARCHAR(255),

    -- Contribution stats
    contributions_count INTEGER DEFAULT 0,
    verified_contributions INTEGER DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,

    -- Roles
    role VARCHAR(20) DEFAULT 'contributor',  -- contributor, editor, admin
    expertise_areas TEXT[],  -- ['biblical_history', 'south_africa', 'roman_empire']

    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP
);

-- Contribution history for auditing
CREATE TABLE contributions (
    id SERIAL PRIMARY KEY,

    user_id INTEGER REFERENCES users(id),

    -- What was contributed
    entity_type VARCHAR(50) NOT NULL,  -- place, place_name, boundary, event
    entity_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL,        -- create, update, delete, verify

    -- Change details
    changes JSONB,                       -- Before/after for updates
    notes TEXT,

    -- Review status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MAP LAYERS & DISPLAY
-- ============================================

-- Predefined map layers users can toggle
CREATE TABLE map_layers (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) NOT NULL,
    description TEXT,
    layer_type VARCHAR(50),  -- base, overlay, historical

    -- Time constraints
    year_start INTEGER,
    year_end INTEGER,

    -- Display
    default_visible BOOLEAN DEFAULT FALSE,
    style JSONB,             -- MapLibre style definition
    z_index INTEGER DEFAULT 0,

    -- Grouping
    category VARCHAR(50),    -- 'Biblical', 'Colonial', 'Pre-Colonial', 'Modern'

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Saved map views/bookmarks
CREATE TABLE saved_views (
    id SERIAL PRIMARY KEY,

    user_id INTEGER REFERENCES users(id),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Map state
    center_lat DECIMAL(10, 7),
    center_lng DECIMAL(10, 7),
    zoom DECIMAL(4, 2),
    year INTEGER,            -- Timeline position
    active_layers INTEGER[], -- Layer IDs

    -- Sharing
    is_public BOOLEAN DEFAULT FALSE,
    share_url VARCHAR(100) UNIQUE,

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Spatial indexes
CREATE INDEX idx_places_geometry ON places USING GIST(geometry);
CREATE INDEX idx_boundaries_geometry ON boundaries USING GIST(geometry);
CREATE INDEX idx_events_geometry ON events USING GIST(geometry);

-- Time-based queries
CREATE INDEX idx_place_names_years ON place_names(year_start, year_end);
CREATE INDEX idx_boundaries_years ON boundaries(year_start, year_end);
CREATE INDEX idx_events_year ON events(year);

-- Text search
CREATE INDEX idx_places_name_trgm ON places USING GIN(current_name gin_trgm_ops);
CREATE INDEX idx_place_names_name_trgm ON place_names USING GIN(name gin_trgm_ops);

-- Foreign keys
CREATE INDEX idx_place_names_place ON place_names(place_id);
CREATE INDEX idx_events_place ON events(place_id);
CREATE INDEX idx_boundaries_parent ON boundaries(parent_boundary_id);

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Places with all their historical names
CREATE VIEW places_with_names AS
SELECT
    p.*,
    COALESCE(
        json_agg(
            json_build_object(
                'name', pn.name,
                'name_native', pn.name_native,
                'language', pn.language,
                'year_start', pn.year_start,
                'year_end', pn.year_end,
                'name_type', pn.name_type,
                'used_by', pn.used_by
            ) ORDER BY pn.year_start NULLS FIRST
        ) FILTER (WHERE pn.id IS NOT NULL),
        '[]'
    ) AS historical_names
FROM places p
LEFT JOIN place_names pn ON p.id = pn.place_id
GROUP BY p.id;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get place name at a specific year
CREATE OR REPLACE FUNCTION get_place_name_at_year(p_place_id INTEGER, p_year INTEGER)
RETURNS TABLE(name VARCHAR, name_native VARCHAR, language VARCHAR, used_by VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT pn.name, pn.name_native, pn.language, pn.used_by
    FROM place_names pn
    WHERE pn.place_id = p_place_id
      AND (pn.year_start IS NULL OR pn.year_start <= p_year)
      AND (pn.year_end IS NULL OR pn.year_end >= p_year)
    ORDER BY pn.year_start DESC NULLS LAST
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Search places by name (fuzzy, across all time periods)
CREATE OR REPLACE FUNCTION search_places(search_term VARCHAR, result_limit INTEGER DEFAULT 20)
RETURNS TABLE(
    place_id INTEGER,
    current_name VARCHAR,
    matched_name VARCHAR,
    match_type VARCHAR,
    geometry GEOMETRY,
    place_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    -- Match current name
    SELECT DISTINCT ON (p.id)
        p.id,
        p.current_name,
        p.current_name AS matched_name,
        'current'::VARCHAR AS match_type,
        p.geometry,
        p.place_type
    FROM places p
    WHERE p.current_name ILIKE '%' || search_term || '%'

    UNION ALL

    -- Match historical names
    SELECT DISTINCT ON (p.id)
        p.id,
        p.current_name,
        pn.name AS matched_name,
        'historical'::VARCHAR AS match_type,
        p.geometry,
        p.place_type
    FROM places p
    JOIN place_names pn ON p.id = pn.place_id
    WHERE pn.name ILIKE '%' || search_term || '%'

    ORDER BY current_name
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
