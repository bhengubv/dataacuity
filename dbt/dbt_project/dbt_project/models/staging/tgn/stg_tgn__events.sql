{{ config(
    materialized='view',
    schema='staging'
) }}

/*
    Staging model for TGN events
    Flattens JSONB metrics into typed columns where common patterns exist
*/

with source as (
    select * from {{ source('tgn', 'events') }}
),

staged as (
    select
        -- Primary keys
        id as event_id,

        -- Dimensions
        source::text as source_name,
        period_type::text as period_type,

        -- Timestamps
        period_start,
        period_end,
        received_at,

        -- Period duration in hours (for rate calculations)
        extract(epoch from (period_end - period_start)) / 3600.0 as period_hours,

        -- Raw JSONB (for flexible querying)
        metrics,
        metadata,

        -- Common metric extractions (NULL if not present)
        -- Counts (integers)
        (metrics->>'registrations_count')::bigint as registrations_count,
        (metrics->>'logins_count')::bigint as logins_count,
        (metrics->>'failed_logins_count')::bigint as failed_logins_count,
        (metrics->>'transactions_count')::bigint as transactions_count,
        (metrics->>'orders_count')::bigint as orders_count,
        (metrics->>'care_orders_count')::bigint as care_orders_count,
        (metrics->>'messages_sent')::bigint as messages_sent,
        (metrics->>'tickets_opened')::bigint as tickets_opened,
        (metrics->>'tickets_resolved')::bigint as tickets_resolved,

        -- Amounts (decimals)
        (metrics->>'total_deposits_amount')::decimal(18,2) as total_deposits_amount,
        (metrics->>'total_withdrawals_amount')::decimal(18,2) as total_withdrawals_amount,
        (metrics->>'total_transaction_value')::decimal(18,2) as total_transaction_value,
        (metrics->>'care_orders_total_value')::decimal(18,2) as care_orders_total_value,
        (metrics->>'gmv')::decimal(18,2) as gross_merchandise_value,

        -- Rates (percentages as decimals)
        (metrics->>'mfa_adoption_rate')::decimal(5,4) as mfa_adoption_rate,
        (metrics->>'conversion_rate')::decimal(5,4) as conversion_rate,
        (metrics->>'churn_rate')::decimal(5,4) as churn_rate,
        (metrics->>'csat_score')::decimal(5,2) as csat_score,

        -- Integrity
        checksum,
        schema_version,

        -- Date dimensions (for partitioning/filtering)
        date_trunc('day', period_start)::date as period_date,
        date_trunc('month', period_start)::date as period_month,
        date_trunc('year', period_start)::date as period_year,
        extract(dow from period_start) as day_of_week,
        extract(hour from period_start) as hour_of_day

    from source
)

select * from staged
