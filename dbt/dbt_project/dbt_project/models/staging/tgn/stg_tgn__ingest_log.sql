{{ config(
    materialized='view',
    schema='staging'
) }}

/*
    Staging model for TGN ingest audit log
    Tracks all ingest operations for monitoring and compliance
*/

with source as (
    select * from {{ source('tgn', 'ingest_log') }}
),

staged as (
    select
        id as log_id,
        source::text as source_name,
        batch_id,
        records_count,
        client_ip::text as client_ip,
        app_id,
        processing_ms,
        status,
        error_message,
        received_at,

        -- Derived metrics
        case
            when records_count > 0 and processing_ms > 0
            then (records_count::decimal / processing_ms) * 1000
            else null
        end as records_per_second,

        -- Status flags
        status = 'success' as is_success,
        status = 'partial' as is_partial,
        status = 'failed' as is_failed,

        -- Date dimensions
        date_trunc('day', received_at)::date as ingest_date,
        date_trunc('hour', received_at) as ingest_hour

    from source
)

select * from staged
