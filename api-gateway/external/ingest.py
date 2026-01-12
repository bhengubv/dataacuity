"""
TGN Data Ingest Module for DataAcuity API Gateway
Handles ingestion of anonymized analytics data from The Geek Network

Endpoints:
- POST /api/v1/ingest/tgn - Ingest TGN metrics (JSON)
- GET /api/v1/ingest/tgn/status - Check ingest status
- GET /api/v1/ingest/tgn/sources - List valid sources
"""

import hashlib
import logging
from datetime import datetime
from typing import Optional, List, Any
from enum import Enum

from fastapi import APIRouter, Request, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

import sys
sys.path.insert(0, "/home/geektrading/api-gateway")

from shared import get_dwh, get_client_ip

logger = logging.getLogger("ingest")

router = APIRouter(prefix="/v1/ingest", tags=["Ingest"])


# =============================================================================
# Enums and Models
# =============================================================================

class TGNSource(str, Enum):
    """Valid TGN data sources (matches PostgreSQL enum)"""
    BRUH = "bruh"
    AUTH = "auth"
    LEDGER = "ledger"
    PAYFAST = "payfast"
    MEDIA = "media"
    MESSAGING = "messaging"
    GLOCELL = "glocell"
    SDPKT = "sdpkt"
    SLEPTON = "slepton"
    TAGME = "tagme"
    JOBCENTER = "jobcenter"
    BIDBAAS = "bidbaas"
    KIFFSTORE = "kiffstore"
    TRUSTSEAL = "trustseal"
    OPSUPPORT = "opsupport"


class PeriodType(str, Enum):
    """Aggregation period types"""
    FIFTEEN_MIN = "15min"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class TGNMetricRecord(BaseModel):
    """Single metric record from TGN"""
    source: TGNSource
    period_type: PeriodType
    period_start: datetime
    period_end: datetime
    metrics: dict = Field(..., description="Flexible JSON metrics payload")
    metadata: Optional[dict] = Field(default_factory=dict)

    @validator('period_end')
    def end_after_start(cls, v, values):
        if 'period_start' in values and v <= values['period_start']:
            raise ValueError('period_end must be after period_start')
        return v

    @validator('metrics')
    def metrics_not_empty(cls, v):
        if not v:
            raise ValueError('metrics cannot be empty')
        return v


class TGNIngestRequest(BaseModel):
    """Batch ingest request from TGN"""
    batch_id: Optional[str] = Field(None, description="Client-provided batch identifier")
    records: List[TGNMetricRecord] = Field(..., min_items=1, max_items=1000)
    schema_version: str = Field(default="1.0")

    class Config:
        json_schema_extra = {
            "example": {
                "batch_id": "tgn-2024-01-15-auth-daily",
                "schema_version": "1.0",
                "records": [
                    {
                        "source": "auth",
                        "period_type": "daily",
                        "period_start": "2024-01-15T00:00:00Z",
                        "period_end": "2024-01-16T00:00:00Z",
                        "metrics": {
                            "registrations_count": 1250,
                            "logins_count": 45000,
                            "failed_logins_count": 320,
                            "kyc_tier_distribution": {
                                "none": 0.15,
                                "basic": 0.60,
                                "full": 0.25
                            },
                            "mfa_adoption_rate": 0.42
                        },
                        "metadata": {
                            "generated_at": "2024-01-16T01:00:00Z",
                            "generator_version": "1.2.0"
                        }
                    }
                ]
            }
        }


class TGNIngestResponse(BaseModel):
    """Response from ingest operation"""
    success: bool
    batch_id: Optional[str]
    records_received: int
    records_inserted: int
    processing_time_ms: int
    errors: Optional[List[dict]] = None


# =============================================================================
# Helper Functions
# =============================================================================

def compute_checksum(metrics: dict) -> str:
    """Compute SHA256 checksum of metrics for integrity verification"""
    import json
    metrics_str = json.dumps(metrics, sort_keys=True, default=str)
    return hashlib.sha256(metrics_str.encode()).hexdigest()


async def log_ingest(
    db: AsyncSession,
    source: str,
    batch_id: Optional[str],
    records_count: int,
    client_ip: str,
    app_id: Optional[str],
    processing_ms: int,
    status: str,
    error_message: Optional[str] = None
):
    """Log ingest operation for audit trail"""
    await db.execute(
        text("""
            INSERT INTO tgn.ingest_log
            (source, batch_id, records_count, client_ip, app_id, processing_ms, status, error_message)
            VALUES (:source::tgn.source_type, :batch_id, :records_count, :client_ip::inet, :app_id, :processing_ms, :status, :error_message)
        """),
        {
            "source": source,
            "batch_id": batch_id,
            "records_count": records_count,
            "client_ip": client_ip,
            "app_id": app_id,
            "processing_ms": processing_ms,
            "status": status,
            "error_message": error_message
        }
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/tgn/sources")
async def list_sources():
    """
    List all valid TGN data sources.

    Use these source values when submitting data.
    """
    return {
        "sources": [
            {"value": s.value, "name": s.name, "description": get_source_description(s.value)}
            for s in TGNSource
        ],
        "period_types": [p.value for p in PeriodType]
    }


def get_source_description(source: str) -> str:
    """Get description for a source"""
    descriptions = {
        "bruh": "Bruh! Super App - Care orders, providers, recipients",
        "auth": "AuthAPI - Identity, sessions, KYC verification",
        "ledger": "LedgerAPI - Wallets, transactions, balances",
        "payfast": "PayfastAPI - Payment processing, gateways",
        "media": "MediaAPI - File storage, CDN, processing",
        "messaging": "MessagingAPI - SMS, email, push notifications",
        "glocell": "GlocellAPI - Airtime, data bundles, electricity",
        "sdpkt": "SdpktAPI - Marketplace, sellers, orders",
        "slepton": "SleptOnAPI - Content platform, creators, payouts",
        "tagme": "TagMeAPI - Social platform, posts, engagement",
        "jobcenter": "JobCenterAPI - Jobs, applications, companies",
        "bidbaas": "BidBaasAPI - Auctions, bids, advertisements",
        "kiffstore": "KiffStoreAPI - E-commerce, products, orders",
        "trustseal": "TrustSealAPI - Document verification, blockchain",
        "opsupport": "OpSupportAPI - Support tickets, CSAT",
    }
    return descriptions.get(source, "Unknown source")


@router.get("/tgn/status")
async def ingest_status(db: AsyncSession = Depends(get_dwh)):
    """
    Get ingest status and statistics.

    Shows recent ingest activity and partition health.
    """
    # Get recent ingest stats
    result = await db.execute(text("""
        SELECT
            source::text,
            COUNT(*) as ingests_24h,
            SUM(records_count) as records_24h,
            MAX(received_at) as last_ingest,
            AVG(processing_ms)::int as avg_processing_ms
        FROM tgn.ingest_log
        WHERE received_at > NOW() - INTERVAL '24 hours'
        GROUP BY source
        ORDER BY source
    """))
    recent_ingests = [dict(row._mapping) for row in result.fetchall()]

    # Get partition stats
    result = await db.execute(text("""
        SELECT
            COUNT(*) as partition_count,
            SUM(row_count) as total_rows,
            SUM(size_bytes) as total_bytes,
            MIN(start_date) as earliest_partition,
            MAX(end_date) as latest_partition
        FROM tgn.partition_registry
    """))
    partition_stats = dict(result.fetchone()._mapping)

    # Get total records
    result = await db.execute(text("SELECT COUNT(*) as total FROM tgn.events"))
    total_events = result.scalar()

    return {
        "status": "healthy",
        "total_events": total_events,
        "partitions": partition_stats,
        "recent_activity": recent_ingests,
        "retention_policy": "5 years",
        "storage_format": "JSONB"
    }


@router.post("/tgn", response_model=TGNIngestResponse)
async def ingest_tgn_data(
    request: Request,
    payload: TGNIngestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_dwh),
):
    """
    Ingest anonymized metrics from The Geek Network.

    **Authentication Required**: Use X-App-ID and X-App-Secret headers.

    **Rate Limit**: Whitelisted IPs bypass rate limiting.

    **Payload Limits**:
    - Maximum 1000 records per request
    - Maximum 10MB payload size

    **Data Requirements**:
    - All data must be pre-anonymized (no PII)
    - Metrics should be aggregated (not raw events)
    - Include checksums for data integrity verification
    """
    start_time = datetime.utcnow()
    client_ip = get_client_ip(request)
    app_id = request.headers.get("X-App-ID")

    # Validate app credentials (should be done by auth middleware, but double-check)
    if not app_id:
        raise HTTPException(
            status_code=401,
            detail="X-App-ID header required for ingest operations"
        )

    inserted = 0
    errors = []

    try:
        # Insert records
        for i, record in enumerate(payload.records):
            try:
                checksum = compute_checksum(record.metrics)

                import json
                await db.execute(
                    text("""
                        INSERT INTO tgn.events
                        (source, period_type, period_start, period_end, metrics, metadata, checksum, schema_version)
                        VALUES (
                            CAST(:source AS tgn.source_type),
                            CAST(:period_type AS tgn.period_type),
                            :period_start,
                            :period_end,
                            CAST(:metrics AS jsonb),
                            CAST(:metadata AS jsonb),
                            :checksum,
                            :schema_version
                        )
                    """),
                    {
                        "source": record.source.value,
                        "period_type": record.period_type.value,
                        "period_start": record.period_start,
                        "period_end": record.period_end,
                        "metrics": json.dumps(record.metrics),
                        "metadata": json.dumps(record.metadata or {}),
                        "checksum": checksum,
                        "schema_version": payload.schema_version
                    }
                )
                inserted += 1

            except Exception as e:
                errors.append({
                    "record_index": i,
                    "source": record.source.value,
                    "error": str(e)
                })
                logger.warning(f"Failed to insert record {i}: {e}")

        await db.commit()

        processing_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Log the ingest operation (in background to not delay response)
        # Determine primary source for logging
        primary_source = payload.records[0].source.value if payload.records else "unknown"

        background_tasks.add_task(
            log_ingest,
            db,
            primary_source,
            payload.batch_id,
            len(payload.records),
            client_ip,
            app_id,
            processing_ms,
            "success" if not errors else "partial",
            str(errors) if errors else None
        )

        logger.info(
            f"TGN ingest: batch={payload.batch_id}, records={len(payload.records)}, "
            f"inserted={inserted}, errors={len(errors)}, ms={processing_ms}"
        )

        return TGNIngestResponse(
            success=len(errors) == 0,
            batch_id=payload.batch_id,
            records_received=len(payload.records),
            records_inserted=inserted,
            processing_time_ms=processing_ms,
            errors=errors if errors else None
        )

    except Exception as e:
        await db.rollback()
        processing_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        logger.error(f"TGN ingest failed: {e}")

        # Log failure
        try:
            primary_source = payload.records[0].source.value if payload.records else "unknown"
            await log_ingest(
                db,
                primary_source,
                payload.batch_id,
                len(payload.records),
                client_ip,
                app_id,
                processing_ms,
                "failed",
                str(e)
            )
            await db.commit()
        except:
            pass

        raise HTTPException(
            status_code=500,
            detail=f"Ingest failed: {str(e)}"
        )


@router.post("/tgn/validate")
async def validate_payload(payload: TGNIngestRequest):
    """
    Validate ingest payload without inserting.

    Use this endpoint to test your payload format before actual ingestion.
    """
    return {
        "valid": True,
        "batch_id": payload.batch_id,
        "records_count": len(payload.records),
        "sources": list(set(r.source.value for r in payload.records)),
        "period_types": list(set(r.period_type.value for r in payload.records)),
        "schema_version": payload.schema_version,
        "checksums": [
            {
                "index": i,
                "source": r.source.value,
                "checksum": compute_checksum(r.metrics)
            }
            for i, r in enumerate(payload.records[:5])  # First 5 only
        ]
    }


@router.get("/tgn/schema")
async def get_schema():
    """
    Get the expected schema for TGN data ingestion.

    Returns the JSON schema and example payloads for each source.
    """
    return {
        "schema_version": "1.0",
        "endpoint": "POST /api/v1/ingest/tgn",
        "authentication": {
            "required": True,
            "method": "X-App-ID + X-App-Secret headers"
        },
        "payload_limits": {
            "max_records_per_request": 1000,
            "max_payload_size_mb": 10
        },
        "retention": {
            "policy": "5 years",
            "format": "JSONB in PostgreSQL",
            "partitioning": "Monthly"
        },
        "required_fields": {
            "source": "One of: " + ", ".join([s.value for s in TGNSource]),
            "period_type": "One of: " + ", ".join([p.value for p in PeriodType]),
            "period_start": "ISO 8601 datetime",
            "period_end": "ISO 8601 datetime (must be after period_start)",
            "metrics": "JSON object with metric key-value pairs"
        },
        "optional_fields": {
            "batch_id": "Client-provided identifier for tracking",
            "metadata": "Additional metadata (generator version, etc.)"
        },
        "examples": {
            "auth_daily": {
                "source": "auth",
                "period_type": "daily",
                "period_start": "2024-01-15T00:00:00Z",
                "period_end": "2024-01-16T00:00:00Z",
                "metrics": {
                    "registrations_count": 1250,
                    "logins_count": 45000,
                    "failed_logins_count": 320,
                    "mfa_adoption_rate": 0.42
                }
            },
            "ledger_hourly": {
                "source": "ledger",
                "period_type": "hourly",
                "period_start": "2024-01-15T14:00:00Z",
                "period_end": "2024-01-15T15:00:00Z",
                "metrics": {
                    "total_deposits_amount": 125000.50,
                    "total_deposits_count": 342,
                    "total_withdrawals_amount": 89000.00,
                    "total_withdrawals_count": 156
                }
            },
            "bruh_daily": {
                "source": "bruh",
                "period_type": "daily",
                "period_start": "2024-01-15T00:00:00Z",
                "period_end": "2024-01-16T00:00:00Z",
                "metrics": {
                    "care_orders_count": 850,
                    "care_orders_total_value": 425000.00,
                    "orders_by_provider": {
                        "checkers_sixty60": 0.35,
                        "pick_n_pay": 0.28,
                        "woolworths": 0.22,
                        "uber_eats": 0.15
                    },
                    "top_corridors": [
                        {"from": "UK", "to": "Gauteng", "percentage": 0.32},
                        {"from": "USA", "to": "Western Cape", "percentage": 0.18}
                    ]
                }
            }
        }
    }
