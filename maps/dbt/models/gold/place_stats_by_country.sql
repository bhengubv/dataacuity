-- Gold layer: Place statistics by country
-- Aggregated metrics for analytics dashboards

{{ config(
    materialized='table',
    schema='gold'
) }}

SELECT
    country_code,
    country_name,
    continent,
    place_type,
    COUNT(*) as place_count,
    SUM(population) as total_population,
    AVG(population) as avg_population,
    AVG(elevation_m) as avg_elevation_m,
    MAX(population) as max_population,
    MIN(created_at) as first_created,
    MAX(updated_at) as last_updated
FROM {{ ref('places_enriched') }}
WHERE country_code IS NOT NULL
GROUP BY country_code, country_name, continent, place_type
ORDER BY country_code, place_count DESC
