-- Staging model for historical place names
-- Links names to places with time periods

{{ config(
    materialized='view',
    schema='staging'
) }}

SELECT
    id,
    place_id,
    name,
    name_native,
    language,
    year_start,
    year_end,
    name_type,
    source,
    used_by
FROM {{ source('bronze', 'place_names') }}
