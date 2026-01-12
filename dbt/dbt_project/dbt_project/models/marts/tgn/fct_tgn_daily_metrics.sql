{{ config(
    materialized='table',
    schema='marts',
    partition_by={'field': 'period_date', 'data_type': 'date'},
    cluster_by=['source_name']
) }}

/*
    Daily aggregated metrics from TGN sources
    Aggregates all period types to daily granularity
*/

with daily_events as (
    select
        source_name,
        period_date,
        period_month,
        period_year,

        -- Sum up counts
        sum(registrations_count) as total_registrations,
        sum(logins_count) as total_logins,
        sum(failed_logins_count) as total_failed_logins,
        sum(transactions_count) as total_transactions,
        sum(orders_count) as total_orders,
        sum(care_orders_count) as total_care_orders,
        sum(messages_sent) as total_messages_sent,
        sum(tickets_opened) as total_tickets_opened,
        sum(tickets_resolved) as total_tickets_resolved,

        -- Sum up monetary amounts
        sum(total_deposits_amount) as total_deposits,
        sum(total_withdrawals_amount) as total_withdrawals,
        sum(total_transaction_value) as total_transaction_value,
        sum(care_orders_total_value) as total_care_order_value,
        sum(gross_merchandise_value) as total_gmv,

        -- Average rates (weighted by period_hours would be better but this is simpler)
        avg(mfa_adoption_rate) as avg_mfa_adoption_rate,
        avg(conversion_rate) as avg_conversion_rate,
        avg(csat_score) as avg_csat_score,

        -- Event counts
        count(*) as event_count,
        count(distinct period_type) as period_types_reported,
        max(received_at) as last_updated

    from {{ ref('stg_tgn__events') }}
    group by 1, 2, 3, 4
)

select
    {{ dbt_utils.generate_surrogate_key(['source_name', 'period_date']) }} as metric_id,
    *,

    -- Derived metrics
    case
        when total_logins > 0
        then total_failed_logins::decimal / total_logins
        else null
    end as login_failure_rate,

    case
        when total_deposits > 0
        then total_withdrawals / total_deposits
        else null
    end as withdrawal_to_deposit_ratio,

    case
        when total_tickets_opened > 0
        then total_tickets_resolved::decimal / total_tickets_opened
        else null
    end as ticket_resolution_rate

from daily_events
