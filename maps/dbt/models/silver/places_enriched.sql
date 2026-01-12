-- Silver layer: Enriched places with country data
-- Joins places with country reference for analytics

{{ config(
    materialized='table',
    schema='silver'
) }}

SELECT
    p.id,
    p.uuid,
    p.current_name,
    p.ascii_name,
    p.place_type,
    p.feature_class,
    p.feature_code,
    p.country_code,
    c.name as country_name,
    c.continent,
    c.capital as country_capital,
    p.admin1_code,
    p.admin2_code,
    p.population,
    p.elevation_m,
    p.timezone,
    p.source,
    p.source_id,
    p.geometry,
    p.created_at,
    p.updated_at
FROM {{ ref('stg_places') }} p
LEFT JOIN {{ ref('stg_countries') }} c ON p.country_code = c.iso_code
