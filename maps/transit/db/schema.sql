-- SA Transit Data Hub - GTFS-based Schema
-- Follows GTFS specification with extensions for crowdsourcing

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ==========================================
-- CORE GTFS TABLES
-- ==========================================

-- Data sources tracking
CREATE TABLE IF NOT EXISTS data_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'gtfs', 'pdf', 'crowdsourced', 'api'
    url TEXT,
    last_updated TIMESTAMP WITH TIME ZONE,
    update_frequency VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'manual'
    country_code CHAR(2) DEFAULT 'ZA',
    region VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transit agencies
CREATE TABLE IF NOT EXISTS agencies (
    id SERIAL PRIMARY KEY,
    agency_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    agency_name VARCHAR(255) NOT NULL,
    agency_url TEXT,
    agency_timezone VARCHAR(100) DEFAULT 'Africa/Johannesburg',
    agency_lang CHAR(2) DEFAULT 'en',
    agency_phone VARCHAR(50),
    agency_fare_url TEXT,
    agency_email VARCHAR(255),
    -- Extended fields
    country_code CHAR(2) DEFAULT 'ZA',
    region VARCHAR(100),
    service_area GEOMETRY(POLYGON, 4326),
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agency_id, data_source_id)
);

-- Stops/Stations
CREATE TABLE IF NOT EXISTS stops (
    id SERIAL PRIMARY KEY,
    stop_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    stop_code VARCHAR(50),
    stop_name VARCHAR(255) NOT NULL,
    stop_desc TEXT,
    stop_lat DOUBLE PRECISION NOT NULL,
    stop_lon DOUBLE PRECISION NOT NULL,
    zone_id VARCHAR(50),
    stop_url TEXT,
    location_type SMALLINT DEFAULT 0, -- 0=stop, 1=station, 2=entrance
    parent_station VARCHAR(255),
    stop_timezone VARCHAR(100),
    wheelchair_boarding SMALLINT DEFAULT 0,
    level_id VARCHAR(50),
    platform_code VARCHAR(50),
    -- Extended fields
    geometry GEOMETRY(POINT, 4326),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(50),
    amenities JSONB DEFAULT '[]'::jsonb, -- ['shelter', 'bench', 'lighting']
    photo_urls JSONB DEFAULT '[]'::jsonb,
    is_verified BOOLEAN DEFAULT false,
    verification_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(stop_id, data_source_id)
);

-- Routes
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    route_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    agency_id VARCHAR(255),
    route_short_name VARCHAR(50),
    route_long_name VARCHAR(255),
    route_desc TEXT,
    route_type SMALLINT NOT NULL, -- 0=tram, 1=subway, 2=rail, 3=bus, 4=ferry, 5=cable, 6=gondola, 7=funicular, 11=trolleybus, 12=monorail
    route_url TEXT,
    route_color CHAR(6),
    route_text_color CHAR(6),
    route_sort_order INTEGER,
    continuous_pickup SMALLINT DEFAULT 1,
    continuous_drop_off SMALLINT DEFAULT 1,
    -- Extended fields
    route_geometry GEOMETRY(LINESTRING, 4326),
    average_headway_minutes INTEGER,
    operating_hours JSONB, -- {"weekday": {"start": "05:30", "end": "22:00"}, ...}
    fare_estimate JSONB, -- {"min": 10, "max": 50, "currency": "ZAR"}
    accessibility_info JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(route_id, data_source_id)
);

-- Service calendar
CREATE TABLE IF NOT EXISTS calendar (
    id SERIAL PRIMARY KEY,
    service_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    monday BOOLEAN NOT NULL,
    tuesday BOOLEAN NOT NULL,
    wednesday BOOLEAN NOT NULL,
    thursday BOOLEAN NOT NULL,
    friday BOOLEAN NOT NULL,
    saturday BOOLEAN NOT NULL,
    sunday BOOLEAN NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(service_id, data_source_id)
);

-- Calendar exceptions
CREATE TABLE IF NOT EXISTS calendar_dates (
    id SERIAL PRIMARY KEY,
    service_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    date DATE NOT NULL,
    exception_type SMALLINT NOT NULL, -- 1=added, 2=removed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(service_id, date, data_source_id)
);

-- Trips
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    route_id VARCHAR(255) NOT NULL,
    service_id VARCHAR(255) NOT NULL,
    trip_headsign VARCHAR(255),
    trip_short_name VARCHAR(50),
    direction_id SMALLINT,
    block_id VARCHAR(255),
    shape_id VARCHAR(255),
    wheelchair_accessible SMALLINT DEFAULT 0,
    bikes_allowed SMALLINT DEFAULT 0,
    -- Extended fields
    approximate_duration_minutes INTEGER,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trip_id, data_source_id)
);

-- Stop times
CREATE TABLE IF NOT EXISTS stop_times (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    arrival_time INTERVAL NOT NULL, -- Can exceed 24:00:00
    departure_time INTERVAL NOT NULL,
    stop_id VARCHAR(255) NOT NULL,
    stop_sequence INTEGER NOT NULL,
    stop_headsign VARCHAR(255),
    pickup_type SMALLINT DEFAULT 0,
    drop_off_type SMALLINT DEFAULT 0,
    continuous_pickup SMALLINT,
    continuous_drop_off SMALLINT,
    shape_dist_traveled DOUBLE PRECISION,
    timepoint SMALLINT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trip_id, stop_sequence, data_source_id)
);

-- Route shapes
CREATE TABLE IF NOT EXISTS shapes (
    id SERIAL PRIMARY KEY,
    shape_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    shape_pt_lat DOUBLE PRECISION NOT NULL,
    shape_pt_lon DOUBLE PRECISION NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    shape_dist_traveled DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pre-computed shape geometries for faster queries
CREATE TABLE IF NOT EXISTS shape_geometries (
    id SERIAL PRIMARY KEY,
    shape_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    geometry GEOMETRY(LINESTRING, 4326) NOT NULL,
    total_distance_meters DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(shape_id, data_source_id)
);

-- Fare information
CREATE TABLE IF NOT EXISTS fare_attributes (
    id SERIAL PRIMARY KEY,
    fare_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    price DECIMAL(10, 2) NOT NULL,
    currency_type CHAR(3) DEFAULT 'ZAR',
    payment_method SMALLINT NOT NULL, -- 0=on board, 1=before
    transfers SMALLINT, -- empty=unlimited
    agency_id VARCHAR(255),
    transfer_duration INTEGER, -- seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(fare_id, data_source_id)
);

CREATE TABLE IF NOT EXISTS fare_rules (
    id SERIAL PRIMARY KEY,
    fare_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    route_id VARCHAR(255),
    origin_id VARCHAR(255),
    destination_id VARCHAR(255),
    contains_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Frequencies for headway-based services
CREATE TABLE IF NOT EXISTS frequencies (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    start_time INTERVAL NOT NULL,
    end_time INTERVAL NOT NULL,
    headway_secs INTEGER NOT NULL,
    exact_times SMALLINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transfer rules
CREATE TABLE IF NOT EXISTS transfers (
    id SERIAL PRIMARY KEY,
    from_stop_id VARCHAR(255) NOT NULL,
    to_stop_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    transfer_type SMALLINT NOT NULL,
    min_transfer_time INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feed metadata
CREATE TABLE IF NOT EXISTS feed_info (
    id SERIAL PRIMARY KEY,
    data_source_id INTEGER REFERENCES data_sources(id),
    feed_publisher_name VARCHAR(255) NOT NULL,
    feed_publisher_url TEXT,
    feed_lang CHAR(2) DEFAULT 'en',
    default_lang CHAR(2),
    feed_start_date DATE,
    feed_end_date DATE,
    feed_version VARCHAR(50),
    feed_contact_email VARCHAR(255),
    feed_contact_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- CROWDSOURCING TABLES (for TagMe integration)
-- ==========================================

-- User contributions
CREATE TABLE IF NOT EXISTS contributors (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    reputation_score INTEGER DEFAULT 0,
    contributions_count INTEGER DEFAULT 0,
    verified_contributions INTEGER DEFAULT 0,
    first_contribution TIMESTAMP WITH TIME ZONE,
    last_contribution TIMESTAMP WITH TIME ZONE,
    is_trusted BOOLEAN DEFAULT false, -- Can verify others
    is_banned BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crowdsourced route contributions
CREATE TABLE IF NOT EXISTS route_contributions (
    id SERIAL PRIMARY KEY,
    contributor_id INTEGER REFERENCES contributors(id),
    route_type VARCHAR(50) NOT NULL, -- 'minibus_taxi', 'bus', 'train', 'other'
    route_name VARCHAR(255),
    route_number VARCHAR(50),
    origin_name VARCHAR(255),
    destination_name VARCHAR(255),
    waypoints GEOMETRY(LINESTRING, 4326),
    recorded_points JSONB, -- Raw GPS points with timestamps
    stops JSONB DEFAULT '[]'::jsonb, -- Identified stops along route
    fare_amount DECIMAL(10, 2),
    fare_currency CHAR(3) DEFAULT 'ZAR',
    operating_hours JSONB,
    notes TEXT,
    photo_urls JSONB DEFAULT '[]'::jsonb,
    -- Verification
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified', 'rejected', 'merged'
    verified_by INTEGER REFERENCES contributors(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    merged_to_route_id INTEGER REFERENCES routes(id),
    -- Voting
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    verification_count INTEGER DEFAULT 0, -- Number of similar routes submitted
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stop contributions
CREATE TABLE IF NOT EXISTS stop_contributions (
    id SERIAL PRIMARY KEY,
    contributor_id INTEGER REFERENCES contributors(id),
    stop_name VARCHAR(255),
    location GEOMETRY(POINT, 4326) NOT NULL,
    stop_type VARCHAR(50), -- 'taxi_rank', 'bus_stop', 'train_station', 'informal'
    description TEXT,
    amenities JSONB DEFAULT '[]'::jsonb,
    photo_urls JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'pending',
    verified_by INTEGER REFERENCES contributors(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    merged_to_stop_id INTEGER REFERENCES stops(id),
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contribution votes
CREATE TABLE IF NOT EXISTS contribution_votes (
    id SERIAL PRIMARY KEY,
    contributor_id INTEGER REFERENCES contributors(id),
    route_contribution_id INTEGER REFERENCES route_contributions(id),
    stop_contribution_id INTEGER REFERENCES stop_contributions(id),
    vote_type SMALLINT NOT NULL, -- 1=upvote, -1=downvote
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT one_target CHECK (
        (route_contribution_id IS NOT NULL AND stop_contribution_id IS NULL) OR
        (route_contribution_id IS NULL AND stop_contribution_id IS NOT NULL)
    )
);

-- ==========================================
-- REAL-TIME DATA TABLES
-- ==========================================

-- Vehicle positions (for real-time tracking)
CREATE TABLE IF NOT EXISTS vehicle_positions (
    id SERIAL PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL,
    trip_id VARCHAR(255),
    route_id VARCHAR(255),
    data_source_id INTEGER REFERENCES data_sources(id),
    position GEOMETRY(POINT, 4326) NOT NULL,
    bearing DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    current_stop_sequence INTEGER,
    current_status VARCHAR(20), -- 'incoming', 'stopped', 'in_transit'
    congestion_level VARCHAR(20),
    occupancy_status VARCHAR(20),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service alerts
CREATE TABLE IF NOT EXISTS service_alerts (
    id SERIAL PRIMARY KEY,
    alert_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    cause VARCHAR(50),
    effect VARCHAR(50),
    header_text TEXT NOT NULL,
    description_text TEXT,
    url TEXT,
    severity_level VARCHAR(20) DEFAULT 'info',
    active_period_start TIMESTAMP WITH TIME ZONE,
    active_period_end TIMESTAMP WITH TIME ZONE,
    affected_agencies JSONB DEFAULT '[]'::jsonb,
    affected_routes JSONB DEFAULT '[]'::jsonb,
    affected_stops JSONB DEFAULT '[]'::jsonb,
    affected_trips JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trip updates (delays, cancellations)
CREATE TABLE IF NOT EXISTS trip_updates (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(255) NOT NULL,
    data_source_id INTEGER REFERENCES data_sources(id),
    vehicle_id VARCHAR(255),
    delay_seconds INTEGER DEFAULT 0,
    schedule_relationship VARCHAR(20), -- 'scheduled', 'added', 'canceled'
    stop_time_updates JSONB DEFAULT '[]'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ANALYTICS TABLES
-- ==========================================

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    client_id VARCHAR(255),
    response_time_ms INTEGER,
    status_code INTEGER,
    query_params JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Popular routes tracking
CREATE TABLE IF NOT EXISTS route_popularity (
    id SERIAL PRIMARY KEY,
    route_id INTEGER REFERENCES routes(id),
    date DATE NOT NULL,
    api_requests INTEGER DEFAULT 0,
    trip_plans INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(route_id, date)
);

-- ==========================================
-- INDEXES
-- ==========================================

-- Spatial indexes
CREATE INDEX IF NOT EXISTS idx_stops_geometry ON stops USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_routes_geometry ON routes USING GIST(route_geometry);
CREATE INDEX IF NOT EXISTS idx_shape_geometries_geometry ON shape_geometries USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_route_contributions_waypoints ON route_contributions USING GIST(waypoints);
CREATE INDEX IF NOT EXISTS idx_stop_contributions_location ON stop_contributions USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_position ON vehicle_positions USING GIST(position);
CREATE INDEX IF NOT EXISTS idx_agencies_service_area ON agencies USING GIST(service_area);

-- Text search indexes
CREATE INDEX IF NOT EXISTS idx_stops_name ON stops USING GIN(to_tsvector('english', stop_name));
CREATE INDEX IF NOT EXISTS idx_routes_name ON routes USING GIN(to_tsvector('english', COALESCE(route_short_name, '') || ' ' || COALESCE(route_long_name, '')));

-- Foreign key and lookup indexes
CREATE INDEX IF NOT EXISTS idx_stops_data_source ON stops(data_source_id);
CREATE INDEX IF NOT EXISTS idx_routes_data_source ON routes(data_source_id);
CREATE INDEX IF NOT EXISTS idx_routes_agency ON routes(agency_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id, data_source_id);
CREATE INDEX IF NOT EXISTS idx_trips_service ON trips(service_id, data_source_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times(trip_id, data_source_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times(stop_id, data_source_id);
CREATE INDEX IF NOT EXISTS idx_calendar_service ON calendar(service_id, data_source_id);
CREATE INDEX IF NOT EXISTS idx_calendar_dates_service ON calendar_dates(service_id, data_source_id);
CREATE INDEX IF NOT EXISTS idx_shapes_shape ON shapes(shape_id, data_source_id);

-- Status and filter indexes
CREATE INDEX IF NOT EXISTS idx_route_contributions_status ON route_contributions(status);
CREATE INDEX IF NOT EXISTS idx_stop_contributions_status ON stop_contributions(status);
CREATE INDEX IF NOT EXISTS idx_service_alerts_active ON service_alerts(is_active, active_period_start, active_period_end);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_timestamp ON vehicle_positions(timestamp);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_stops_amenities ON stops USING GIN(amenities);
CREATE INDEX IF NOT EXISTS idx_agencies_metadata ON agencies USING GIN(metadata);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_agencies_updated_at ON agencies;
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stops_updated_at ON stops;
CREATE TRIGGER update_stops_updated_at BEFORE UPDATE ON stops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routes_updated_at ON routes;
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_route_contributions_updated_at ON route_contributions;
CREATE TRIGGER update_route_contributions_updated_at BEFORE UPDATE ON route_contributions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to compute stop geometry from lat/lon
CREATE OR REPLACE FUNCTION compute_stop_geometry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.stop_lon, NEW.stop_lat), 4326);
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS compute_stop_geometry_trigger ON stops;
CREATE TRIGGER compute_stop_geometry_trigger BEFORE INSERT OR UPDATE ON stops
    FOR EACH ROW EXECUTE FUNCTION compute_stop_geometry();

-- ==========================================
-- VIEWS
-- ==========================================

-- Unified stops view (combines official and crowdsourced)
CREATE OR REPLACE VIEW all_stops AS
SELECT
    s.id,
    s.stop_id,
    s.stop_name,
    s.stop_lat,
    s.stop_lon,
    s.geometry,
    s.location_type,
    s.amenities,
    ds.name as source_name,
    'official' as origin,
    s.is_verified
FROM stops s
JOIN data_sources ds ON s.data_source_id = ds.id
WHERE s.is_verified = true OR ds.source_type != 'crowdsourced'
UNION ALL
SELECT
    sc.id + 1000000 as id,
    'CS-' || sc.id as stop_id,
    sc.stop_name,
    ST_Y(sc.location) as stop_lat,
    ST_X(sc.location) as stop_lon,
    sc.location as geometry,
    0 as location_type,
    sc.amenities,
    'Crowdsourced' as source_name,
    'crowdsourced' as origin,
    sc.status = 'verified' as is_verified
FROM stop_contributions sc
WHERE sc.status IN ('pending', 'verified');

-- Active routes with stop counts
CREATE OR REPLACE VIEW routes_with_stats AS
SELECT
    r.*,
    a.agency_name,
    ds.name as source_name,
    COUNT(DISTINCT st.stop_id) as stop_count,
    COUNT(DISTINCT t.trip_id) as trip_count
FROM routes r
JOIN data_sources ds ON r.data_source_id = ds.id
LEFT JOIN agencies a ON r.agency_id = a.agency_id AND r.data_source_id = a.data_source_id
LEFT JOIN trips t ON r.route_id = t.route_id AND r.data_source_id = t.data_source_id
LEFT JOIN stop_times st ON t.trip_id = st.trip_id AND t.data_source_id = st.data_source_id
WHERE r.is_active = true
GROUP BY r.id, a.agency_name, ds.name;

-- Contributor leaderboard
CREATE OR REPLACE VIEW contributor_leaderboard AS
SELECT
    c.id,
    c.display_name,
    c.reputation_score,
    c.contributions_count,
    c.verified_contributions,
    c.is_trusted,
    RANK() OVER (ORDER BY c.reputation_score DESC) as rank
FROM contributors c
WHERE c.is_banned = false
ORDER BY c.reputation_score DESC;

-- ==========================================
-- INITIAL DATA
-- ==========================================

-- Insert initial data sources for known SA transit operators
INSERT INTO data_sources (name, source_type, url, country_code, region, metadata) VALUES
('Gautrain', 'gtfs', 'https://gautrain.co.za', 'ZA', 'Gauteng', '{"operator_type": "rail", "official": true}'::jsonb),
('MyCiTi', 'gtfs', 'https://www.myciti.org.za', 'ZA', 'Western Cape', '{"operator_type": "bus", "official": true}'::jsonb),
('Rea Vaya', 'pdf', 'https://www.reavaya.org.za', 'ZA', 'Gauteng', '{"operator_type": "brt", "official": true}'::jsonb),
('Golden Arrow', 'pdf', 'https://www.gabs.co.za', 'ZA', 'Western Cape', '{"operator_type": "bus", "official": true}'::jsonb),
('Metrorail Western Cape', 'pdf', 'https://www.metrorail.co.za', 'ZA', 'Western Cape', '{"operator_type": "rail", "official": true}'::jsonb),
('Metrorail Gauteng', 'pdf', 'https://www.metrorail.co.za', 'ZA', 'Gauteng', '{"operator_type": "rail", "official": true}'::jsonb),
('PUTCO', 'pdf', 'https://www.putco.co.za', 'ZA', 'Gauteng', '{"operator_type": "bus", "official": true}'::jsonb),
('A Re Yeng', 'pdf', 'https://www.tshwane.gov.za', 'ZA', 'Gauteng', '{"operator_type": "brt", "official": true}'::jsonb),
('GO GEORGE', 'gtfs', 'https://www.gogeorge.org.za', 'ZA', 'Western Cape', '{"operator_type": "bus", "official": true}'::jsonb),
('Crowdsourced - TagMe', 'crowdsourced', NULL, 'ZA', NULL, '{"verified_only": false}'::jsonb)
ON CONFLICT DO NOTHING;

-- Phase 1-5: Additional data sources for expanded coverage
INSERT INTO data_sources (name, source_type, url, country_code, region, metadata) VALUES
-- Phase 1: GTFS feeds
('Stellenbosch Taxis', 'gtfs', 'https://hub.tumidata.org/dataset/gtfs-stellenbosch', 'ZA', 'Western Cape', '{"operator_type": "minibus", "source": "TUMI Datahub"}'::jsonb),
-- Phase 3: Regional BRT/Bus
('People Mover', 'pdf', 'https://www.ethekwini.gov.za', 'ZA', 'KwaZulu-Natal', '{"operator_type": "bus", "official": true}'::jsonb),
('Yarona BRT', 'pdf', 'https://www.rustenburg.gov.za', 'ZA', 'North West', '{"operator_type": "brt", "official": true}'::jsonb),
('Libhongolethu BRT', 'pdf', 'https://www.nelsonmandelabay.gov.za', 'ZA', 'Eastern Cape', '{"operator_type": "brt", "official": true}'::jsonb),
('Metrorail KwaZulu-Natal', 'pdf', 'https://www.metrorail.co.za', 'ZA', 'KwaZulu-Natal', '{"operator_type": "rail", "official": true}'::jsonb),
-- Phase 4: Intercity buses
('Intercape', 'scrape', 'https://www.intercape.co.za', 'ZA', 'National', '{"operator_type": "intercity_bus"}'::jsonb),
('Translux', 'scrape', 'https://www.translux.co.za', 'ZA', 'National', '{"operator_type": "intercity_bus"}'::jsonb),
('Greyhound', 'scrape', 'https://www.greyhound.co.za', 'ZA', 'National', '{"operator_type": "intercity_bus"}'::jsonb),
-- Phase 5: API integration
('WhereIsMyTransport', 'api', 'https://whereismytransport.com', 'ZA', 'National', '{"requires_api_key": true, "coverage": "657 taxi routes Cape Town"}'::jsonb)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE data_sources IS 'Tracks all data sources including GTFS feeds, PDF schedules, and crowdsourced data';
COMMENT ON TABLE agencies IS 'Transit agencies/operators following GTFS agency.txt specification';
COMMENT ON TABLE stops IS 'Transit stops following GTFS stops.txt with PostGIS geometry';
COMMENT ON TABLE routes IS 'Transit routes following GTFS routes.txt with geometry';
COMMENT ON TABLE route_contributions IS 'Crowdsourced route data from TagMe integration';
COMMENT ON TABLE stop_contributions IS 'Crowdsourced stop data from TagMe integration';
