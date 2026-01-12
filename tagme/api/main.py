"""
TagMe Ingestion API
====================
High-throughput microservice for receiving location data from TagMe mobile app.
Designed to be stateless and horizontally scalable.

Data flows:
  TagMe App → This API → Staging DB → Airbyte → Anonymize → Maps DB → Maps Frontend
"""

import os
import uuid
import logging
from datetime import datetime
from typing import Optional, List, Any
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# =============================================================================
# Configuration
# =============================================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://maps:maps@maps_db:5432/maps"
)

# Rate limiting config
RATE_LIMIT = os.getenv("RATE_LIMIT", "100/minute")
BURST_LIMIT = os.getenv("BURST_LIMIT", "1000/minute")

# Keycloak/OAuth2 Configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://auth.dataacuity.co.za")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "dataacuity")

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("tagme-api")

# =============================================================================
# Database Connection Pool
# =============================================================================

db_pool: Optional[asyncpg.Pool] = None

async def get_db_pool() -> asyncpg.Pool:
    global db_pool
    if db_pool is None:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
    return db_pool

async def get_connection():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        yield conn

# =============================================================================
# Pydantic Models - Request/Response Schemas
# =============================================================================

class LocationPing(BaseModel):
    """Raw location ping from mobile device"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, le=10000)
    altitude_m: Optional[float] = None
    speed_mps: Optional[float] = None
    bearing: Optional[float] = None
    timestamp: Optional[datetime] = None
    device_id_hash: Optional[str] = Field(None, max_length=64)
    session_id: Optional[str] = Field(None, max_length=64)

    @validator('timestamp', pre=True, always=True)
    def set_timestamp(cls, v):
        return v or datetime.utcnow()

class LocationBatch(BaseModel):
    """Batch of location pings for efficient upload"""
    pings: List[LocationPing] = Field(..., max_items=1000)
    app_version: Optional[str] = None
    platform: Optional[str] = None  # ios, android

class PlaceSuggestion(BaseModel):
    """User-suggested place or point of interest"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    name: Optional[str] = Field(None, max_length=500)
    place_type: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None
    photos: Optional[List[str]] = None  # URLs or base64
    device_id_hash: Optional[str] = Field(None, max_length=64)
    metadata: Optional[dict] = None  # Flexible for future fields

class Advertisement(BaseModel):
    """Advertising data - events, businesses, promotions"""
    ad_type: str = Field(..., pattern="^(event|business|promotion|notice)$")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius_m: Optional[float] = Field(None, ge=0, le=100000)
    title: str = Field(..., max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    contact_info: Optional[dict] = None
    media_urls: Optional[List[str]] = None
    category: Optional[str] = Field(None, max_length=100)
    advertiser_id: str = Field(..., max_length=100)
    payment_ref: Optional[str] = Field(None, max_length=100)
    metadata: Optional[dict] = None

class GenericIngest(BaseModel):
    """Generic ingestion endpoint for any JSON data"""
    data_type: str = Field(..., max_length=100)
    payload: dict
    source: Optional[str] = Field(None, max_length=100)
    metadata: Optional[dict] = None

class IngestResponse(BaseModel):
    """Standard response for ingestion endpoints"""
    success: bool
    ingestion_id: str
    message: str
    count: Optional[int] = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    database: str
    timestamp: datetime
    version: str

# =============================================================================
# Rate Limiter
# =============================================================================

limiter = Limiter(key_func=get_remote_address)

# =============================================================================
# Application Lifecycle
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting TagMe Ingestion API...")
    pool = await get_db_pool()

    # Ensure staging schema exists
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE SCHEMA IF NOT EXISTS staging;
        """)
        logger.info("Staging schema ready")

    yield

    # Shutdown
    logger.info("Shutting down TagMe API...")
    if db_pool:
        await db_pool.close()

# =============================================================================
# FastAPI Application
# =============================================================================

app = FastAPI(
    title="TagMe Ingestion API",
    description="""
## High-Throughput Location Ingestion Service

Microservice for receiving location data from TagMe mobile apps.
Designed for high-throughput, stateless, horizontally scalable operation.

### Features
- **Location Pings**: Individual or batched location uploads
- **Place Suggestions**: Crowdsourced POI contributions
- **Traffic Data**: Anonymous speed/travel time contributions

### Data Flow
```
TagMe App → This API → Staging DB → Anonymize → Maps DB → Maps Platform
```

### Mobile SDKs
- iOS: `pod 'DataAcuityTagMe'`
- Android: `implementation 'co.za.dataacuity:tagme:1.0.0'`
- React Native: `npm install @dataacuity/tagme-react-native`

## Authentication

### 1. API Key (Mobile Apps)
```
X-API-Key: dak_your_api_key_here
```

### 2. OAuth2/JWT Token
```
Authorization: Bearer <jwt_token>
```

## Rate Limits
- Single ping: 100 requests/minute
- Batch upload: 1000 pings/request, 60 requests/minute
""",
    version="1.0.0",
    contact={
        "name": "DataAcuity API Support",
        "email": "api-support@dataacuity.co.za",
    },
    servers=[
        {"url": "https://tagme.dataacuity.co.za", "description": "Production"},
        {"url": "https://api.dataacuity.co.za/api/v1/tagme", "description": "Via API Gateway"},
        {"url": "http://localhost:5023", "description": "Development"},
    ],
    lifespan=lifespan
)

# Custom OpenAPI schema with OAuth2 security
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        servers=app.servers,
        contact=app.contact,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "OAuth2": {
            "type": "oauth2",
            "flows": {
                "authorizationCode": {
                    "authorizationUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth",
                    "tokenUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "scopes": {"openid": "OpenID Connect scope"}
                }
            }
        },
        "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
        "ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
    }
    openapi_schema["security"] = [{"BearerAuth": []}, {"ApiKeyAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# CORS - allow mobile apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# =============================================================================
# Health & Status Endpoints
# =============================================================================

@app.get("/", include_in_schema=False)
async def root():
    return {"service": "TagMe Ingestion API", "status": "running"}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for load balancers and monitoring"""
    db_status = "unknown"
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
            db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return HealthResponse(
        status="healthy" if db_status == "healthy" else "degraded",
        database=db_status,
        timestamp=datetime.utcnow(),
        version="1.0.0"
    )

@app.get("/ready")
async def readiness_check():
    """Kubernetes readiness probe"""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"ready": True}
    except Exception:
        raise HTTPException(status_code=503, detail="Not ready")

@app.get("/stats")
async def get_stats():
    """Get ingestion statistics"""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            stats = await conn.fetchrow("""
                SELECT
                    (SELECT COUNT(*) FROM staging.location_pings) as location_pings,
                    (SELECT COUNT(*) FROM staging.place_suggestions) as place_suggestions,
                    (SELECT COUNT(*) FROM staging.advertisements) as advertisements,
                    (SELECT COUNT(*) FROM staging.generic_data) as generic_data
            """)
            return {
                "location_pings": stats['location_pings'] if stats else 0,
                "place_suggestions": stats['place_suggestions'] if stats else 0,
                "advertisements": stats['advertisements'] if stats else 0,
                "generic_data": stats['generic_data'] if stats else 0,
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception as e:
        # Tables might not exist yet
        return {
            "location_pings": 0,
            "place_suggestions": 0,
            "advertisements": 0,
            "generic_data": 0,
            "note": "Stats unavailable - tables may not be initialized",
            "timestamp": datetime.utcnow().isoformat()
        }

# =============================================================================
# Ingestion Endpoints
# =============================================================================

@app.post("/ingest/location", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_location(request: Request, ping: LocationPing):
    """
    Ingest a single location ping.
    For high-volume apps, use /ingest/locations/batch instead.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO staging.location_pings (
                    ingestion_id, latitude, longitude, accuracy_m,
                    altitude_m, speed_mps, bearing, ping_timestamp,
                    device_id_hash, session_id, received_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            """,
                ingestion_id,
                ping.latitude,
                ping.longitude,
                ping.accuracy_m,
                ping.altitude_m,
                ping.speed_mps,
                ping.bearing,
                ping.timestamp,
                ping.device_id_hash,
                ping.session_id
            )

        logger.info(f"Ingested location ping: {ingestion_id}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message="Location ping received",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest location: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/locations/batch", response_model=IngestResponse)
@limiter.limit(BURST_LIMIT)
async def ingest_locations_batch(request: Request, batch: LocationBatch):
    """
    Ingest a batch of location pings efficiently.
    Maximum 1000 pings per request.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Prepare batch insert
            records = [
                (
                    ingestion_id,
                    ping.latitude,
                    ping.longitude,
                    ping.accuracy_m,
                    ping.altitude_m,
                    ping.speed_mps,
                    ping.bearing,
                    ping.timestamp,
                    ping.device_id_hash,
                    ping.session_id,
                    batch.app_version,
                    batch.platform
                )
                for ping in batch.pings
            ]

            await conn.executemany("""
                INSERT INTO staging.location_pings (
                    ingestion_id, latitude, longitude, accuracy_m,
                    altitude_m, speed_mps, bearing, ping_timestamp,
                    device_id_hash, session_id, app_version, platform, received_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            """, records)

        logger.info(f"Ingested {len(batch.pings)} location pings: {ingestion_id}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Batch of {len(batch.pings)} location pings received",
            count=len(batch.pings)
        )
    except Exception as e:
        logger.error(f"Failed to ingest location batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/place", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_place_suggestion(request: Request, place: PlaceSuggestion):
    """
    Ingest a user-suggested place or point of interest.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            import json
            await conn.execute("""
                INSERT INTO staging.place_suggestions (
                    ingestion_id, latitude, longitude, name,
                    place_type, description, tags, photos,
                    device_id_hash, metadata, received_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            """,
                ingestion_id,
                place.latitude,
                place.longitude,
                place.name,
                place.place_type,
                place.description,
                place.tags,
                place.photos,
                place.device_id_hash,
                json.dumps(place.metadata) if place.metadata else None
            )

        logger.info(f"Ingested place suggestion: {ingestion_id}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message="Place suggestion received",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest place: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/ad", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_advertisement(request: Request, ad: Advertisement):
    """
    Ingest advertising data - events, businesses, promotions.
    This data is public and does not require anonymization.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            import json
            await conn.execute("""
                INSERT INTO staging.advertisements (
                    ingestion_id, ad_type, latitude, longitude, radius_m,
                    title, description, start_time, end_time,
                    contact_info, media_urls, category,
                    advertiser_id, payment_ref, metadata, received_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            """,
                ingestion_id,
                ad.ad_type,
                ad.latitude,
                ad.longitude,
                ad.radius_m,
                ad.title,
                ad.description,
                ad.start_time,
                ad.end_time,
                json.dumps(ad.contact_info) if ad.contact_info else None,
                ad.media_urls,
                ad.category,
                ad.advertiser_id,
                ad.payment_ref,
                json.dumps(ad.metadata) if ad.metadata else None
            )

        logger.info(f"Ingested advertisement: {ingestion_id}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message="Advertisement received",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest advertisement: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/generic", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_generic(request: Request, data: GenericIngest):
    """
    Generic ingestion endpoint for any JSON data.
    Use this for data types not yet defined - classify later.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            import json
            await conn.execute("""
                INSERT INTO staging.generic_data (
                    ingestion_id, data_type, payload, source, metadata, received_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
            """,
                ingestion_id,
                data.data_type,
                json.dumps(data.payload),
                data.source,
                json.dumps(data.metadata) if data.metadata else None
            )

        logger.info(f"Ingested generic data ({data.data_type}): {ingestion_id}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Generic data ({data.data_type}) received",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest generic data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# Airbyte Integration Endpoints
# =============================================================================

@app.get("/airbyte/locations")
async def get_locations_for_airbyte(
    limit: int = 1000,
    offset: int = 0,
    since: Optional[datetime] = None
):
    """
    Endpoint for Airbyte to pull location data.
    Supports pagination and incremental sync.
    """
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            if since:
                rows = await conn.fetch("""
                    SELECT * FROM staging.location_pings
                    WHERE received_at > $1
                    ORDER BY received_at
                    LIMIT $2 OFFSET $3
                """, since, limit, offset)
            else:
                rows = await conn.fetch("""
                    SELECT * FROM staging.location_pings
                    ORDER BY received_at
                    LIMIT $1 OFFSET $2
                """, limit, offset)

            return {
                "data": [dict(row) for row in rows],
                "count": len(rows),
                "offset": offset,
                "limit": limit
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/airbyte/places")
async def get_places_for_airbyte(
    limit: int = 1000,
    offset: int = 0,
    since: Optional[datetime] = None
):
    """Endpoint for Airbyte to pull place suggestion data."""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            if since:
                rows = await conn.fetch("""
                    SELECT * FROM staging.place_suggestions
                    WHERE received_at > $1
                    ORDER BY received_at
                    LIMIT $2 OFFSET $3
                """, since, limit, offset)
            else:
                rows = await conn.fetch("""
                    SELECT * FROM staging.place_suggestions
                    ORDER BY received_at
                    LIMIT $1 OFFSET $2
                """, limit, offset)

            return {
                "data": [dict(row) for row in rows],
                "count": len(rows),
                "offset": offset,
                "limit": limit
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/airbyte/ads")
async def get_ads_for_airbyte(
    limit: int = 1000,
    offset: int = 0,
    since: Optional[datetime] = None
):
    """Endpoint for Airbyte to pull advertisement data."""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            if since:
                rows = await conn.fetch("""
                    SELECT * FROM staging.advertisements
                    WHERE received_at > $1
                    ORDER BY received_at
                    LIMIT $2 OFFSET $3
                """, since, limit, offset)
            else:
                rows = await conn.fetch("""
                    SELECT * FROM staging.advertisements
                    ORDER BY received_at
                    LIMIT $1 OFFSET $2
                """, limit, offset)

            return {
                "data": [dict(row) for row in rows],
                "count": len(rows),
                "offset": offset,
                "limit": limit
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# Waze-like Features: Road Reports
# =============================================================================

# Report type expiry times in minutes
REPORT_EXPIRY = {
    'traffic_jam': 30,
    'traffic_moderate': 20,
    'accident': 120,
    'hazard_road': 240,
    'hazard_weather': 120,
    'police': 60,
    'closure': 1440,  # 24 hours
    'construction': 10080,  # 7 days
    'camera': None,  # Permanent
    'fuel_price': 1440
}

class RoadReport(BaseModel):
    """Road report submission"""
    report_type: str = Field(..., pattern="^(traffic_jam|traffic_moderate|accident|hazard_road|hazard_weather|police|closure|construction|camera|fuel_price)$")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    direction: Optional[int] = Field(None, ge=0, le=360)
    severity: int = Field(1, ge=1, le=5)
    description: Optional[str] = Field(None, max_length=500)
    photo_url: Optional[str] = None
    device_id_hash: str = Field(..., max_length=64)

class ReportVerification(BaseModel):
    """Report verification/dismissal"""
    report_id: int
    action: str = Field(..., pattern="^(confirm|dismiss|not_there)$")
    device_id_hash: str = Field(..., max_length=64)

class ReviewSubmission(BaseModel):
    """Review submission via TagMe"""
    poi_id: Optional[int] = None
    poi_type: Optional[str] = Field(None, max_length=100)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    visit_date: Optional[str] = None
    device_id_hash: str = Field(..., max_length=64)

class MapEdit(BaseModel):
    """Map correction/edit submission"""
    edit_type: str = Field(..., pattern="^(road_missing|road_wrong|turn_restriction|speed_limit|place_closed|place_moved|name_change)$")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    road_name: Optional[str] = Field(None, max_length=200)
    current_value: Optional[str] = Field(None, max_length=500)
    suggested_value: Optional[str] = Field(None, max_length=500)
    evidence: Optional[str] = Field(None, max_length=1000)
    photo_url: Optional[str] = None
    device_id_hash: str = Field(..., max_length=64)

class DriveSession(BaseModel):
    """Drive session for points tracking"""
    start_lat: float = Field(..., ge=-90, le=90)
    start_lng: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lng: float = Field(..., ge=-180, le=180)
    distance_km: float = Field(..., ge=0, le=10000)
    duration_minutes: float = Field(..., ge=0, le=1440)
    device_id_hash: str = Field(..., max_length=64)


@app.post("/ingest/report", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_road_report(request: Request, report: RoadReport):
    """
    Submit a road report (traffic, hazard, police, etc.)
    Reports auto-expire based on type.
    """
    ingestion_id = str(uuid.uuid4())

    # Calculate expiry time
    expiry_minutes = REPORT_EXPIRY.get(report.report_type)
    expires_at = None
    if expiry_minutes:
        from datetime import timedelta
        expires_at = datetime.utcnow() + timedelta(minutes=expiry_minutes)

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO staging.road_reports (
                    ingestion_id, report_type, latitude, longitude,
                    direction, severity, description, photo_url,
                    device_id_hash, expires_at, received_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            """,
                ingestion_id,
                report.report_type,
                report.latitude,
                report.longitude,
                report.direction,
                report.severity,
                report.description,
                report.photo_url,
                report.device_id_hash,
                expires_at
            )

            # Award points to user
            await conn.execute("""
                INSERT INTO staging.user_points (device_id_hash, total_points, reports_submitted)
                VALUES ($1, 10, 1)
                ON CONFLICT (device_id_hash) DO UPDATE SET
                    total_points = staging.user_points.total_points + 10,
                    reports_submitted = staging.user_points.reports_submitted + 1,
                    updated_at = NOW()
            """, report.device_id_hash)

        logger.info(f"Road report ingested: {report.report_type} at {report.latitude},{report.longitude}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Road report ({report.report_type}) received. +10 points!",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest road report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/report/verify", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def verify_road_report(request: Request, verification: ReportVerification):
    """
    Verify or dismiss a road report.
    Actions: confirm (+1), dismiss (-1), not_there (-3)
    """
    ingestion_id = str(uuid.uuid4())

    score_delta = {
        'confirm': 1,
        'dismiss': -1,
        'not_there': -3
    }
    delta = score_delta.get(verification.action, 0)

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Record verification
            await conn.execute("""
                INSERT INTO staging.report_verifications (report_id, action, device_id_hash)
                VALUES ($1, $2, $3)
                ON CONFLICT (report_id, device_id_hash) DO UPDATE SET
                    action = $2, created_at = NOW()
            """, verification.report_id, verification.action, verification.device_id_hash)

            # Update report confidence score
            if verification.action == 'confirm':
                await conn.execute("""
                    UPDATE staging.road_reports
                    SET confidence_score = confidence_score + $1,
                        verified_count = verified_count + 1
                    WHERE id = $2
                """, delta, verification.report_id)
            else:
                await conn.execute("""
                    UPDATE staging.road_reports
                    SET confidence_score = confidence_score + $1,
                        dismissed_count = dismissed_count + 1,
                        is_active = CASE WHEN confidence_score + $1 < -5 THEN false ELSE is_active END
                    WHERE id = $2
                """, delta, verification.report_id)

            # Award points for verification
            await conn.execute("""
                INSERT INTO staging.user_points (device_id_hash, total_points, reports_verified)
                VALUES ($1, 2, 1)
                ON CONFLICT (device_id_hash) DO UPDATE SET
                    total_points = staging.user_points.total_points + 2,
                    reports_verified = staging.user_points.reports_verified + 1,
                    updated_at = NOW()
            """, verification.device_id_hash)

        logger.info(f"Report {verification.report_id} verified: {verification.action}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Report verification recorded. +2 points!",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to verify report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/review", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_review(request: Request, review: ReviewSubmission):
    """
    Submit a place review via TagMe.
    All reviews flow through TagMe for anonymization.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO staging.reviews (
                    ingestion_id, poi_id, poi_type, latitude, longitude,
                    rating, text, tags, photos, visit_date, device_id_hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11)
            """,
                ingestion_id,
                review.poi_id,
                review.poi_type,
                review.latitude,
                review.longitude,
                review.rating,
                review.text,
                review.tags,
                review.photos,
                review.visit_date,
                review.device_id_hash
            )

            # Award points
            await conn.execute("""
                INSERT INTO staging.user_points (device_id_hash, total_points, reviews_submitted)
                VALUES ($1, 15, 1)
                ON CONFLICT (device_id_hash) DO UPDATE SET
                    total_points = staging.user_points.total_points + 15,
                    reviews_submitted = staging.user_points.reviews_submitted + 1,
                    updated_at = NOW()
            """, review.device_id_hash)

        logger.info(f"Review ingested: {review.rating} stars at {review.latitude},{review.longitude}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Review submitted. +15 points!",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/map_edit", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_map_edit(request: Request, edit: MapEdit):
    """
    Submit a map correction or edit suggestion.
    Edits require admin review or community verification.
    """
    ingestion_id = str(uuid.uuid4())

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO staging.map_edits (
                    ingestion_id, edit_type, latitude, longitude,
                    road_name, current_value, suggested_value,
                    evidence, photo_url, device_id_hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
                ingestion_id,
                edit.edit_type,
                edit.latitude,
                edit.longitude,
                edit.road_name,
                edit.current_value,
                edit.suggested_value,
                edit.evidence,
                edit.photo_url,
                edit.device_id_hash
            )

        logger.info(f"Map edit ingested: {edit.edit_type} at {edit.latitude},{edit.longitude}")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Map edit suggestion received. Under review.",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest map edit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/drive_session", response_model=IngestResponse)
@limiter.limit(RATE_LIMIT)
async def ingest_drive_session(request: Request, session: DriveSession):
    """
    Log a drive session for points.
    Awards 5 points per 10km driven.
    """
    ingestion_id = str(uuid.uuid4())
    points_earned = int(session.distance_km / 10) * 5

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO staging.user_points (device_id_hash, total_points, km_driven)
                VALUES ($1, $2, $3)
                ON CONFLICT (device_id_hash) DO UPDATE SET
                    total_points = staging.user_points.total_points + $2,
                    km_driven = staging.user_points.km_driven + $3,
                    updated_at = NOW()
            """, session.device_id_hash, points_earned, session.distance_km)

        logger.info(f"Drive session: {session.distance_km}km, +{points_earned} points")
        return IngestResponse(
            success=True,
            ingestion_id=ingestion_id,
            message=f"Drive session logged. +{points_earned} points for {session.distance_km:.1f}km!",
            count=1
        )
    except Exception as e:
        logger.error(f"Failed to ingest drive session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/user/profile/{device_hash}")
async def get_user_profile(device_hash: str):
    """Get user's points, level, and achievements"""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow("""
                SELECT * FROM staging.user_points WHERE device_id_hash = $1
            """, device_hash)

            if not user:
                return {
                    "total_points": 0,
                    "level": 1,
                    "level_name": "Newbie",
                    "reports_submitted": 0,
                    "reports_verified": 0,
                    "reviews_submitted": 0,
                    "km_driven": 0,
                    "achievements": []
                }

            # Calculate level
            levels = [
                (0, "Newbie", "🌱"),
                (100, "Explorer", "🧭"),
                (500, "Navigator", "🗺️"),
                (2000, "Road Warrior", "⚔️"),
                (10000, "Local Legend", "🏆"),
                (50000, "Map Master", "👑")
            ]
            level = 1
            level_name = "Newbie"
            level_badge = "🌱"
            for i, (points, name, badge) in enumerate(levels):
                if user['total_points'] >= points:
                    level = i + 1
                    level_name = name
                    level_badge = badge

            # Get achievements
            achievements = await conn.fetch("""
                SELECT achievement_id, earned_at FROM staging.user_achievements
                WHERE device_id_hash = $1
            """, device_hash)

            return {
                "total_points": user['total_points'],
                "level": level,
                "level_name": level_name,
                "level_badge": level_badge,
                "reports_submitted": user['reports_submitted'],
                "reports_verified": user['reports_verified'],
                "reviews_submitted": user['reviews_submitted'],
                "km_driven": round(user['km_driven'], 1),
                "achievements": [dict(a) for a in achievements]
            }
    except Exception as e:
        logger.error(f"Failed to get user profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/leaderboard")
async def get_leaderboard(limit: int = 20):
    """Get top contributors leaderboard"""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            leaders = await conn.fetch("""
                SELECT
                    device_id_hash,
                    total_points,
                    reports_submitted,
                    reports_verified,
                    reviews_submitted,
                    km_driven
                FROM staging.user_points
                ORDER BY total_points DESC
                LIMIT $1
            """, limit)

            # Anonymize device hashes for display
            result = []
            for i, row in enumerate(leaders):
                result.append({
                    "rank": i + 1,
                    "user_id": row['device_id_hash'][:8] + "...",
                    "total_points": row['total_points'],
                    "reports": row['reports_submitted'],
                    "reviews": row['reviews_submitted'],
                    "km_driven": round(row['km_driven'], 1)
                })

            return {"leaderboard": result}
    except Exception as e:
        logger.error(f"Failed to get leaderboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Error Handlers
# =============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__}
    )

# =============================================================================
# Run with Uvicorn
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
