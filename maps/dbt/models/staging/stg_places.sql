-- Staging model for places from bronze layer
-- This provides clean, documented data for downstream models

{{ config(
    materialized='view',
    schema='staging'
) }}

SELECT
    id,
    uuid,
    current_name,
    current_name_language,
    geometry,
    place_type,
    osm_id,
    osm_type,
    population,
    elevation_m,
    timezone,
    country_code,
    source,
    source_id,
    admin1_code,
    admin2_code,
    feature_class,
    feature_code,
    ascii_name,
    alternate_names,
    created_at,
    updated_at
FROM {{ source('bronze', 'places') }}
