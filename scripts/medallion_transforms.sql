-- =====================================================
-- MEDALLION ARCHITECTURE TRANSFORMATION PROCEDURES
-- Maps Data Pipeline
-- =====================================================

-- =====================================================
-- 1. BRONZE → SILVER: GeoNames Transform
-- =====================================================
CREATE OR REPLACE FUNCTION silver.transform_geonames()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    INSERT INTO silver.places_cleaned (
        source, source_id, name, ascii_name, alternate_names,
        latitude, longitude, geometry, place_type,
        feature_class, feature_code, country_code,
        admin1_code, admin2_code, population, elevation_m,
        timezone, confidence_score, is_validated
    )
    SELECT
        'geonames',
        geonameid::VARCHAR,
        name,
        asciiname,
        CASE WHEN alternatenames IS NOT NULL AND alternatenames != ''
             THEN string_to_array(alternatenames, ',')
             ELSE NULL END,
        latitude,
        longitude,
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        CASE
            WHEN feature_code IN ('PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4') THEN 'settlement'
            WHEN feature_code = 'PPLC' THEN 'capital'
            WHEN feature_code = 'PPLL' THEN 'locality'
            WHEN feature_code = 'PPLX' THEN 'neighborhood'
            WHEN feature_code IN ('MT', 'MTS', 'PK') THEN 'mountain'
            WHEN feature_code IN ('LK', 'LKS') THEN 'lake'
            WHEN feature_code = 'STM' THEN 'river'
            WHEN feature_code = 'ISL' THEN 'island'
            WHEN feature_code = 'ADM1' THEN 'admin-region'
            WHEN feature_code = 'ADM2' THEN 'admin-district'
            WHEN feature_code = 'PCLI' THEN 'country'
            ELSE COALESCE(LOWER(feature_class), 'unknown')
        END,
        feature_class,
        feature_code,
        country_code,
        admin1_code,
        admin2_code,
        population,
        COALESCE(elevation, dem),
        timezone,
        0.95,  -- High confidence for GeoNames
        TRUE   -- GeoNames is validated data
    FROM bronze.geonames_raw
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND name IS NOT NULL
    ON CONFLICT (source, source_id) DO UPDATE SET
        name = EXCLUDED.name,
        ascii_name = EXCLUDED.ascii_name,
        alternate_names = EXCLUDED.alternate_names,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        geometry = EXCLUDED.geometry,
        place_type = EXCLUDED.place_type,
        population = EXCLUDED.population,
        updated_at = NOW();

    GET DIAGNOSTICS rows_affected = ROW_COUNT;

    -- Log quality metrics
    INSERT INTO silver.quality_metrics (run_date, source, total_records, valid_records)
    VALUES (CURRENT_DATE, 'geonames',
            (SELECT COUNT(*) FROM bronze.geonames_raw),
            rows_affected);

    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. BRONZE → SILVER: Pleiades Transform
-- =====================================================
CREATE OR REPLACE FUNCTION silver.transform_pleiades()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    INSERT INTO silver.places_cleaned (
        source, source_id, name, alternate_names,
        latitude, longitude, geometry, place_type,
        time_period_start, time_period_end,
        confidence_score, is_validated
    )
    SELECT
        'pleiades',
        pleiades_id,
        title,
        CASE WHEN names IS NOT NULL
             THEN ARRAY(SELECT jsonb_array_elements_text(names->'attested'))
             ELSE NULL END,
        representative_lat,
        representative_lon,
        ST_SetSRID(ST_MakePoint(representative_lon, representative_lat), 4326),
        CASE
            WHEN 'settlement' = ANY(feature_types) THEN 'settlement'
            WHEN 'urban' = ANY(feature_types) THEN 'settlement'
            WHEN 'temple' = ANY(feature_types) THEN 'temple'
            WHEN 'fort' = ANY(feature_types) THEN 'fort'
            WHEN 'port' = ANY(feature_types) THEN 'port'
            WHEN 'road' = ANY(feature_types) THEN 'road'
            WHEN 'mountain' = ANY(feature_types) THEN 'mountain'
            WHEN 'river' = ANY(feature_types) THEN 'river'
            WHEN 'island' = ANY(feature_types) THEN 'island'
            ELSE COALESCE(feature_types[1], 'unknown')
        END,
        -- Parse time periods (simplified - Pleiades uses period names)
        CASE
            WHEN 'archaic' = ANY(time_periods) THEN -800
            WHEN 'classical' = ANY(time_periods) THEN -480
            WHEN 'hellenistic-republican' = ANY(time_periods) THEN -330
            WHEN 'roman' = ANY(time_periods) THEN -27
            WHEN 'late-antique' = ANY(time_periods) THEN 300
            WHEN 'mediaeval-byzantine' = ANY(time_periods) THEN 600
            ELSE NULL
        END,
        CASE
            WHEN 'modern' = ANY(time_periods) THEN 2000
            WHEN 'mediaeval-byzantine' = ANY(time_periods) THEN 1453
            WHEN 'late-antique' = ANY(time_periods) THEN 640
            WHEN 'roman' = ANY(time_periods) THEN 476
            WHEN 'hellenistic-republican' = ANY(time_periods) THEN 31
            WHEN 'classical' = ANY(time_periods) THEN -323
            WHEN 'archaic' = ANY(time_periods) THEN -480
            ELSE NULL
        END,
        0.90,  -- Pleiades is scholarly, high confidence
        TRUE
    FROM bronze.pleiades_raw
    WHERE representative_lat IS NOT NULL
      AND representative_lon IS NOT NULL
      AND title IS NOT NULL
    ON CONFLICT (source, source_id) DO UPDATE SET
        name = EXCLUDED.name,
        alternate_names = EXCLUDED.alternate_names,
        geometry = EXCLUDED.geometry,
        place_type = EXCLUDED.place_type,
        time_period_start = EXCLUDED.time_period_start,
        time_period_end = EXCLUDED.time_period_end,
        updated_at = NOW();

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. BRONZE → SILVER: TagMe Anonymized Transform
-- =====================================================
CREATE OR REPLACE FUNCTION silver.transform_tagme()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    -- Only process clusters with sufficient point counts for privacy
    INSERT INTO silver.places_cleaned (
        source, source_id, name,
        latitude, longitude, geometry, place_type,
        country_code, confidence_score, is_validated, validation_notes
    )
    SELECT
        'tagme',
        'cluster_' || point_cluster_id::VARCHAR || '_' || batch_id,
        COALESCE(place_name_suggested, 'User-discovered location'),
        centroid_lat,
        centroid_lon,
        ST_SetSRID(ST_MakePoint(centroid_lon, centroid_lat), 4326),
        COALESCE(place_type_suggested, 'unknown'),
        country_code,
        -- Confidence based on cluster size and accuracy
        LEAST(1.0, (point_count::DECIMAL / 10.0) * (100.0 / GREATEST(avg_accuracy_m, 10))),
        FALSE,  -- TagMe data needs manual validation
        'Auto-clustered from ' || point_count || ' user submissions, avg accuracy ' ||
        ROUND(avg_accuracy_m::NUMERIC, 1) || 'm'
    FROM bronze.tagme_raw
    WHERE point_count >= 3  -- Privacy: minimum 3 users per cluster
      AND avg_accuracy_m < 500  -- Quality: reasonable GPS accuracy
      AND centroid_lat IS NOT NULL
      AND centroid_lon IS NOT NULL
    ON CONFLICT (source, source_id) DO UPDATE SET
        name = EXCLUDED.name,
        geometry = EXCLUDED.geometry,
        confidence_score = EXCLUDED.confidence_score,
        validation_notes = EXCLUDED.validation_notes,
        updated_at = NOW();

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. SILVER → GOLD: Merge to Final Places Table
-- =====================================================
CREATE OR REPLACE FUNCTION public.merge_silver_to_gold()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER := 0;
    r RECORD;
BEGIN
    -- Merge validated places from silver to gold (public.places)
    FOR r IN
        SELECT * FROM silver.places_cleaned
        WHERE is_validated = TRUE
        AND NOT EXISTS (
            SELECT 1 FROM public.places p
            WHERE p.source = silver.places_cleaned.source
            AND p.source_id = silver.places_cleaned.source_id
        )
    LOOP
        INSERT INTO public.places (
            uuid, current_name, ascii_name, alternate_names,
            geometry, place_type, feature_class, feature_code,
            country_code, admin1_code, admin2_code,
            population, elevation_m, timezone, source, source_id
        ) VALUES (
            gen_random_uuid(),
            r.name,
            r.ascii_name,
            array_to_string(r.alternate_names, ','),
            r.geometry,
            r.place_type,
            r.feature_class,
            r.feature_code,
            r.country_code,
            r.admin1_code,
            r.admin2_code,
            r.population,
            r.elevation_m,
            r.timezone,
            r.source,
            r.source_id
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
            current_name = EXCLUDED.current_name,
            geometry = EXCLUDED.geometry,
            population = EXCLUDED.population,
            updated_at = NOW();

        rows_affected := rows_affected + 1;
    END LOOP;

    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. TAGME ANONYMIZATION PIPELINE
-- Process raw user location data into anonymized clusters
-- =====================================================
CREATE OR REPLACE FUNCTION bronze.anonymize_tagme_locations(
    p_batch_id VARCHAR,
    p_cluster_radius_m DOUBLE PRECISION DEFAULT 50.0,
    p_min_points INTEGER DEFAULT 3
)
RETURNS TABLE (
    clusters_created INTEGER,
    points_processed INTEGER,
    points_dropped INTEGER
) AS $$
DECLARE
    v_clusters INTEGER := 0;
    v_processed INTEGER := 0;
    v_dropped INTEGER := 0;
BEGIN
    -- This function would receive raw location data and cluster it
    -- In production, this would be called by the TagMe API

    -- Implementation notes:
    -- 1. Use ST_ClusterDBSCAN to group nearby points
    -- 2. Calculate centroids for each cluster
    -- 3. Only keep clusters with >= min_points (privacy threshold)
    -- 4. Drop individual outliers (privacy protection)

    -- Placeholder return - actual implementation depends on raw data structure
    RETURN QUERY SELECT v_clusters, v_processed, v_dropped;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. FULL ETL PIPELINE ORCHESTRATION
-- =====================================================
CREATE OR REPLACE FUNCTION public.run_maps_etl_pipeline()
RETURNS TABLE (
    step VARCHAR,
    rows_processed INTEGER,
    status VARCHAR
) AS $$
BEGIN
    -- Step 1: Transform GeoNames
    RETURN QUERY SELECT
        'geonames_transform'::VARCHAR,
        silver.transform_geonames(),
        'completed'::VARCHAR;

    -- Step 2: Transform Pleiades
    RETURN QUERY SELECT
        'pleiades_transform'::VARCHAR,
        silver.transform_pleiades(),
        'completed'::VARCHAR;

    -- Step 3: Transform TagMe
    RETURN QUERY SELECT
        'tagme_transform'::VARCHAR,
        silver.transform_tagme(),
        'completed'::VARCHAR;

    -- Step 4: Merge to Gold
    RETURN QUERY SELECT
        'merge_to_gold'::VARCHAR,
        public.merge_silver_to_gold(),
        'completed'::VARCHAR;

    -- Step 5: Refresh materialized views if any
    -- REFRESH MATERIALIZED VIEW CONCURRENTLY public.places_search;

END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA silver TO maps;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA bronze TO maps;
GRANT EXECUTE ON FUNCTION public.run_maps_etl_pipeline() TO maps;
GRANT EXECUTE ON FUNCTION public.merge_silver_to_gold() TO maps;
