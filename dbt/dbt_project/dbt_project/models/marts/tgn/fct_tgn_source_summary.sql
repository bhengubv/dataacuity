{{ config(
    materialized='table',
    schema='marts'
) }}

/*
    Summary statistics per TGN source
    Useful for monitoring data completeness and health
*/

with source_stats as (
    select
        source_name,

        -- Time range
        min(period_start) as earliest_data,
        max(period_end) as latest_data,
        min(received_at) as first_ingested,
        max(received_at) as last_ingested,

        -- Volume
        count(*) as total_events,
        count(distinct period_date) as days_with_data,
        count(distinct period_month) as months_with_data,

        -- Period type breakdown
        count(*) filter (where period_type = '15min') as events_15min,
        count(*) filter (where period_type = 'hourly') as events_hourly,
        count(*) filter (where period_type = 'daily') as events_daily,
        count(*) filter (where period_type = 'weekly') as events_weekly,
        count(*) filter (where period_type = 'monthly') as events_monthly,

        -- Data quality
        count(*) filter (where checksum is not null) as events_with_checksum,
        count(distinct schema_version) as schema_versions_used

    from {{ ref('stg_tgn__events') }}
    group by 1
),

ingest_stats as (
    select
        source_name,
        count(*) as total_ingests,
        sum(records_count) as total_records_ingested,
        avg(processing_ms) as avg_processing_ms,
        sum(case when is_success then 1 else 0 end) as successful_ingests,
        sum(case when is_failed then 1 else 0 end) as failed_ingests,
        avg(records_per_second) as avg_throughput
    from {{ ref('stg_tgn__ingest_log') }}
    group by 1
)

select
    ss.*,
    coalesce(ist.total_ingests, 0) as total_ingests,
    coalesce(ist.total_records_ingested, 0) as total_records_ingested,
    ist.avg_processing_ms,
    coalesce(ist.successful_ingests, 0) as successful_ingests,
    coalesce(ist.failed_ingests, 0) as failed_ingests,
    ist.avg_throughput,

    -- Health metrics
    case
        when ss.last_ingested > now() - interval '24 hours' then 'active'
        when ss.last_ingested > now() - interval '7 days' then 'stale'
        else 'inactive'
    end as source_status,

    round(100.0 * ss.events_with_checksum / nullif(ss.total_events, 0), 2) as checksum_coverage_pct,

    round(100.0 * coalesce(ist.successful_ingests, 0) / nullif(coalesce(ist.total_ingests, 0), 0), 2) as ingest_success_rate

from source_stats ss
left join ingest_stats ist on ss.source_name = ist.source_name
