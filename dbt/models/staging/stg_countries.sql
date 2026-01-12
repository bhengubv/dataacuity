-- Staging model for country reference data

{{ config(
    materialized='view',
    schema='staging'
) }}

SELECT
    id,
    iso_code,
    iso_code3,
    name,
    capital,
    area_sqkm,
    population,
    continent,
    tld,
    currency_code,
    currency_name,
    phone,
    postal_format,
    languages,
    geoname_id,
    neighbours
FROM {{ source('bronze', 'countries') }}
