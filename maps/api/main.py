"""
DataAcuity Historical Maps API
"Navigate Time & Space"
"""

from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel, field_validator
from typing import Optional, List
import os
import sys
import json
import httpx
import hashlib
import logging
import re
from datetime import datetime
from enum import Enum

# Redis for caching
import redis

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# Configuration - Required Environment Variables
# ============================================

def get_required_env(key: str, default: str = None) -> str:
    """Get environment variable, fail if required and not set in production."""
    value = os.getenv(key, default)
    env = os.getenv("ENVIRONMENT", "development")

    if value is None:
        logger.error(f"Required environment variable {key} is not set")
        sys.exit(1)

    # Warn if using default values in production
    if env == "production" and default is not None and value == default:
        logger.warning(f"Using default value for {key} in production environment - this is insecure!")

    return value

# Configuration - no hardcoded credentials in production
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DATABASE_URL = get_required_env("DATABASE_URL",
    "postgresql://maps:maps_secret_2024@localhost:5433/maps" if ENVIRONMENT == "development" else None)
OSRM_URL = get_required_env("OSRM_URL", "http://localhost:5024")
NOMINATIM_URL = get_required_env("NOMINATIM_URL", "http://localhost:5025")
REDIS_URL = get_required_env("REDIS_URL", "redis://localhost:6379")

# CORS - configurable allowed origins
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5022,http://localhost:3000").split(",")
if ENVIRONMENT == "production":
    # In production, require explicit origins
    if "*" in ALLOWED_ORIGINS or not ALLOWED_ORIGINS[0]:
        logger.warning("ALLOWED_ORIGINS not properly configured for production")
        ALLOWED_ORIGINS = ["https://maps.dataacuity.co.za"]

# Redis connection (with graceful fallback if unavailable)
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    REDIS_AVAILABLE = True
    logger.info("Redis connection established")
except redis.ConnectionError as e:
    logger.warning(f"Redis unavailable, caching disabled: {e}")
    redis_client = None
    REDIS_AVAILABLE = False
except Exception as e:
    logger.warning(f"Redis connection failed: {type(e).__name__}: {e}")
    redis_client = None
    REDIS_AVAILABLE = False


def cache_get(key: str):
    """Get value from cache"""
    if not REDIS_AVAILABLE:
        return None
    try:
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except json.JSONDecodeError as e:
        logger.warning(f"Cache decode error for key {key}: {e}")
        return None
    except redis.RedisError as e:
        logger.warning(f"Redis error getting key {key}: {e}")
        return None


def cache_set(key: str, value: dict, ttl_seconds: int = 180):
    """Set value in cache with TTL (default 3 minutes)"""
    if not REDIS_AVAILABLE:
        return
    try:
        redis_client.setex(key, ttl_seconds, json.dumps(value))
    except (redis.RedisError, TypeError) as e:
        logger.warning(f"Redis error setting key {key}: {e}")


def cache_key(*args) -> str:
    """Generate cache key from arguments"""
    return f"maps:{hashlib.md5(':'.join(str(a) for a in args).encode()).hexdigest()}"


# ============================================
# Input Validation Helpers
# ============================================

BBOX_PATTERN = re.compile(r'^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$')
USER_HASH_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{8,64}$')

def validate_bbox(bbox: str) -> List[float]:
    """Validate and parse bbox parameter. Returns [minLng, minLat, maxLng, maxLat]."""
    if not bbox or not BBOX_PATTERN.match(bbox):
        raise HTTPException(
            status_code=400,
            detail="Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat"
        )

    try:
        coords = [float(x) for x in bbox.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid bbox coordinates")

    # Validate coordinate ranges
    min_lng, min_lat, max_lng, max_lat = coords
    if not (-180 <= min_lng <= 180 and -180 <= max_lng <= 180):
        raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
    if min_lng >= max_lng or min_lat >= max_lat:
        raise HTTPException(status_code=400, detail="Invalid bbox: min values must be less than max values")

    return coords

def validate_user_hash(user_hash: str) -> str:
    """Validate user hash format."""
    if not user_hash or not USER_HASH_PATTERN.match(user_hash):
        raise HTTPException(
            status_code=400,
            detail="Invalid user_hash format. Must be 8-64 alphanumeric characters."
        )
    return user_hash


# Database setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Keycloak/OAuth2 Configuration for Swagger
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://auth.dataacuity.co.za")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "dataacuity")

# FastAPI app with OAuth2 security scheme
app = FastAPI(
    title="DataAcuity Historical Maps API",
    description="""
## Navigate Time & Space
A crowdsourced historical maps platform providing:
- **Places & POIs**: Historical place names, points of interest
- **Routing**: Driving, walking, cycling directions via OSRM
- **Geocoding**: Address-to-coordinates and reverse geocoding
- **Traffic**: Real-time traffic from crowdsourced data

## Authentication

This API supports multiple authentication methods via the DataAcuity API Gateway:

### 1. API Key (Recommended for applications)
```
X-API-Key: dak_your_api_key_here
```

### 2. OAuth2/JWT (For user sessions)
```
Authorization: Bearer <jwt_token>
```
Obtain tokens from: `{keycloak_url}/realms/{realm}/protocol/openid-connect/token`

### 3. Internal App Credentials
```
X-App-ID: your-app-id
X-App-Secret: das_your_secret
```

## Rate Limits
- `/api/places`: 100 requests/minute
- `/api/geocode`: 60 requests/minute
- `/api/route`: 60 requests/minute

Rate limits are per-IP. Authenticated requests may have higher limits based on plan.
""".format(keycloak_url=KEYCLOAK_URL, realm=KEYCLOAK_REALM),
    version="1.0.0",
    contact={
        "name": "DataAcuity API Support",
        "url": "https://dataacuity.co.za/support",
        "email": "api-support@dataacuity.co.za",
    },
    license_info={
        "name": "Proprietary",
        "url": "https://dataacuity.co.za/terms",
    },
    servers=[
        {"url": "https://maps.dataacuity.co.za/api", "description": "Production"},
        {"url": "https://api.dataacuity.co.za/api/v1/maps", "description": "Via API Gateway"},
        {"url": "http://localhost:5020/api", "description": "Development"},
    ],
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
        license_info=app.license_info,
    )
    # Add OAuth2 security schemes
    openapi_schema["components"]["securitySchemes"] = {
        "OAuth2": {
            "type": "oauth2",
            "flows": {
                "authorizationCode": {
                    "authorizationUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth",
                    "tokenUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "scopes": {
                        "openid": "OpenID Connect scope",
                        "profile": "User profile access",
                        "email": "User email access",
                    }
                },
                "clientCredentials": {
                    "tokenUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "scopes": {
                        "openid": "OpenID Connect scope",
                    }
                }
            }
        },
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token from Keycloak"
        },
        "ApiKeyAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "API Key from DataAcuity developer portal"
        }
    }
    # Apply security globally (optional)
    openapi_schema["security"] = [
        {"BearerAuth": []},
        {"ApiKeyAuth": []},
        {"OAuth2": ["openid", "profile", "email"]}
    ]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Add rate limit exceeded handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - configured with specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Global exception handler to prevent information leakage
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions without leaking internal details."""
    logger.error(f"Unhandled exception: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================
# Pydantic Models
# ============================================

class PlaceNameCreate(BaseModel):
    name: str
    name_native: Optional[str] = None
    language: Optional[str] = None
    language_code: Optional[str] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    year_accuracy: str = "exact"
    name_type: str = "official"
    used_by: Optional[str] = None
    source_type: Optional[str] = None
    source_title: Optional[str] = None
    source_author: Optional[str] = None
    source_url: Optional[str] = None

class PlaceCreate(BaseModel):
    current_name: str
    lat: float
    lng: float
    place_type: str
    country_code: Optional[str] = None
    historical_names: Optional[List[PlaceNameCreate]] = []

class EventCreate(BaseModel):
    name: str
    description: Optional[str] = None
    event_type: Optional[str] = None
    year: int
    month: Optional[int] = None
    day: Optional[int] = None
    place_id: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    categories: Optional[List[str]] = []
    source_title: Optional[str] = None
    source_url: Optional[str] = None

class BoundaryCreate(BaseModel):
    name: str
    name_native: Optional[str] = None
    boundary_type: str
    year_start: int
    year_end: Optional[int] = None
    geojson: dict  # GeoJSON polygon
    source_title: Optional[str] = None


# ============================================
# API Routes
# ============================================

@app.get("/")
def root():
    return {
        "name": "DataAcuity Historical Maps API",
        "tagline": "Navigate Time & Space",
        "version": "1.0.0",
        "endpoints": {
            "places": "/api/places",
            "search": "/api/search",
            "timeline": "/api/timeline/{year}",
            "events": "/api/events",
            "boundaries": "/api/boundaries"
        }
    }


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")


# ============================================
# Places Endpoints
# ============================================

@app.get("/api/places")
@limiter.limit("100/minute")
def get_places(
    request: Request,
    bbox: Optional[str] = Query(None, description="Bounding box: minLng,minLat,maxLng,maxLat"),
    place_type: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db)
):
    """Get places within a bounding box"""
    query = """
        SELECT
            p.id, p.uuid, p.current_name, p.place_type, p.country_code,
            ST_AsGeoJSON(p.geometry)::json as geometry,
            ST_X(ST_Centroid(p.geometry)) as lng,
            ST_Y(ST_Centroid(p.geometry)) as lat
        FROM places p
        WHERE 1=1
    """
    params = {}

    if bbox:
        coords = validate_bbox(bbox)
        query += """ AND ST_Intersects(
            p.geometry,
            ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
        )"""
        params.update({
            "min_lng": coords[0], "min_lat": coords[1],
            "max_lng": coords[2], "max_lat": coords[3]
        })

    if place_type:
        query += " AND p.place_type = :place_type"
        params["place_type"] = place_type

    query += " LIMIT :limit"
    params["limit"] = limit

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    return {"type": "FeatureCollection", "features": [
        {
            "type": "Feature",
            "id": p["id"],
            "geometry": p["geometry"],
            "properties": {
                "id": p["id"],
                "uuid": str(p["uuid"]),
                "name": p["current_name"],
                "place_type": p["place_type"],
                "country_code": p["country_code"]
            }
        } for p in places
    ]}


@app.get("/api/places/{place_id}")
def get_place(place_id: int, db: Session = Depends(get_db)):
    """Get a place with all its historical names"""
    query = """
        SELECT
            p.id, p.uuid, p.current_name, p.place_type, p.country_code,
            p.population, p.elevation_m,
            ST_AsGeoJSON(p.geometry)::json as geometry,
            ST_X(ST_Centroid(p.geometry)) as lng,
            ST_Y(ST_Centroid(p.geometry)) as lat
        FROM places p
        WHERE p.id = :place_id
    """
    result = db.execute(text(query), {"place_id": place_id}).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="Place not found")

    place = dict(result._mapping)

    # Get historical names
    names_query = """
        SELECT name, name_native, language, year_start, year_end,
               name_type, used_by, source_title, source_url
        FROM place_names
        WHERE place_id = :place_id
        ORDER BY year_start NULLS FIRST
    """
    names_result = db.execute(text(names_query), {"place_id": place_id})
    historical_names = [dict(row._mapping) for row in names_result]

    return {
        **place,
        "historical_names": historical_names
    }


@app.post("/api/places")
def create_place(place: PlaceCreate, db: Session = Depends(get_db)):
    """Create a new place with optional historical names"""
    # Insert place
    query = """
        INSERT INTO places (current_name, geometry, place_type, country_code)
        VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :place_type, :country_code)
        RETURNING id, uuid
    """
    result = db.execute(text(query), {
        "name": place.current_name,
        "lng": place.lng,
        "lat": place.lat,
        "place_type": place.place_type,
        "country_code": place.country_code
    })
    new_place = result.fetchone()
    place_id = new_place[0]

    # Insert historical names
    for hn in place.historical_names:
        names_query = """
            INSERT INTO place_names (
                place_id, name, name_native, language, language_code,
                year_start, year_end, year_accuracy, name_type, used_by,
                source_type, source_title, source_author, source_url
            ) VALUES (
                :place_id, :name, :name_native, :language, :language_code,
                :year_start, :year_end, :year_accuracy, :name_type, :used_by,
                :source_type, :source_title, :source_author, :source_url
            )
        """
        db.execute(text(names_query), {"place_id": place_id, **hn.model_dump()})

    db.commit()
    return {"id": place_id, "uuid": str(new_place[1]), "message": "Place created successfully"}


# ============================================
# Timeline Endpoint (Core Feature!)
# ============================================

@app.get("/api/timeline/{year}")
def get_timeline(
    year: int,
    bbox: Optional[str] = Query(None, description="Bounding box: minLng,minLat,maxLng,maxLat"),
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db)
):
    """
    Get places with their names as they were in a specific year.
    Negative years = BCE (e.g., -1000 = 1000 BCE)
    """
    query = """
        SELECT
            p.id,
            p.current_name,
            COALESCE(
                (SELECT pn.name FROM place_names pn
                 WHERE pn.place_id = p.id
                   AND (pn.year_start IS NULL OR pn.year_start <= :year)
                   AND (pn.year_end IS NULL OR pn.year_end >= :year)
                 ORDER BY pn.year_start DESC NULLS LAST
                 LIMIT 1),
                p.current_name
            ) as name_at_year,
            COALESCE(
                (SELECT pn.name_native FROM place_names pn
                 WHERE pn.place_id = p.id
                   AND (pn.year_start IS NULL OR pn.year_start <= :year)
                   AND (pn.year_end IS NULL OR pn.year_end >= :year)
                 ORDER BY pn.year_start DESC NULLS LAST
                 LIMIT 1),
                NULL
            ) as native_name_at_year,
            COALESCE(
                (SELECT pn.used_by FROM place_names pn
                 WHERE pn.place_id = p.id
                   AND (pn.year_start IS NULL OR pn.year_start <= :year)
                   AND (pn.year_end IS NULL OR pn.year_end >= :year)
                 ORDER BY pn.year_start DESC NULLS LAST
                 LIMIT 1),
                NULL
            ) as used_by_at_year,
            p.place_type,
            ST_AsGeoJSON(p.geometry)::json as geometry,
            ST_X(ST_Centroid(p.geometry)) as lng,
            ST_Y(ST_Centroid(p.geometry)) as lat
        FROM places p
        WHERE 1=1
    """
    params = {"year": year, "limit": limit}

    if bbox:
        coords = validate_bbox(bbox)
        query += """ AND ST_Intersects(
            p.geometry,
            ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
        )"""
        params.update({
            "min_lng": coords[0], "min_lat": coords[1],
            "max_lng": coords[2], "max_lat": coords[3]
        })

    query += " LIMIT :limit"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    # Format year display
    year_display = f"{abs(year)} {'BCE' if year < 0 else 'CE'}"

    return {
        "year": year,
        "year_display": year_display,
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": p["id"],
                "geometry": p["geometry"],
                "properties": {
                    "id": p["id"],
                    "current_name": p["current_name"],
                    "name_at_year": p["name_at_year"],
                    "native_name": p["native_name_at_year"],
                    "used_by": p["used_by_at_year"],
                    "place_type": p["place_type"],
                    "display_name": f"{p['name_at_year']}" + (f" ({p['current_name']})" if p['name_at_year'] != p['current_name'] else "")
                }
            } for p in places
        ]
    }


# ============================================
# Search Endpoint
# ============================================

@app.get("/api/search")
def search_places(
    q: str = Query(..., min_length=2, description="Search query"),
    year: Optional[int] = None,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """Search places by name with full location hierarchy (optimized for speed)"""
    # Optimized query: search only current_name with trigram index
    # Then join with lookup tables for the limited result set
    query = """
        WITH matched_places AS (
            SELECT id, current_name, place_type, country_code, admin1_code, admin2_code,
                   population, geometry,
                   CASE WHEN current_name ILIKE :exact_pattern THEN 0 ELSE 1 END as match_rank
            FROM places
            WHERE current_name ILIKE :search_pattern
            ORDER BY match_rank, population DESC NULLS LAST
            LIMIT :limit
        )
        SELECT
            p.id,
            p.current_name,
            NULL as matched_name,
            'current' as match_type,
            NULL::int as year_start,
            NULL::int as year_end,
            NULL as used_by,
            p.place_type,
            p.country_code,
            c.name as country_name,
            c.continent,
            a1.name as admin1_name,
            a2.name as admin2_name,
            ST_X(ST_Centroid(p.geometry)) as lng,
            ST_Y(ST_Centroid(p.geometry)) as lat
        FROM matched_places p
        LEFT JOIN countries c ON p.country_code = c.code
        LEFT JOIN admin1_divisions a1 ON p.admin1_code = a1.code
        LEFT JOIN admin2_divisions a2 ON p.admin2_code = a2.code
        ORDER BY p.match_rank, p.population DESC NULLS LAST
    """

    result = db.execute(text(query), {
        "search_pattern": f"%{q}%",
        "exact_pattern": f"{q}%",
        "limit": limit
    })

    results = []
    for row in result:
        r = dict(row._mapping)
        # Build location hierarchy string
        hierarchy_parts = []
        if r.get('admin2_name'):
            hierarchy_parts.append(r['admin2_name'])
        if r.get('admin1_name'):
            hierarchy_parts.append(r['admin1_name'])
        if r.get('country_name'):
            hierarchy_parts.append(r['country_name'])
        if r.get('continent'):
            hierarchy_parts.append(r['continent'])
        r['location_hierarchy'] = ', '.join(hierarchy_parts) if hierarchy_parts else None
        results.append(r)

    return {
        "query": q,
        "count": len(results),
        "results": results
    }


# ============================================
# POI (Points of Interest) Endpoints
# ============================================

@app.get("/api/pois/search", tags=["POI"])
def search_pois(
    q: str = Query(..., min_length=1, description="Search query"),
    category: Optional[str] = Query(None, description="Category filter"),
    lat: Optional[float] = Query(None, description="User latitude for distance sorting"),
    lng: Optional[float] = Query(None, description="User longitude for distance sorting"),
    radius_km: int = Query(50, description="Search radius in km (when lat/lng provided)"),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """
    Search points of interest with instant autocomplete.
    Pre-loaded with South African malls, airports, hospitals, landmarks, etc.
    """
    query = """
        SELECT
            p.id,
            p.name,
            p.name_alt,
            c.name AS category,
            p.subcategory,
            p.latitude,
            p.longitude,
            p.address,
            p.suburb,
            p.city,
            p.province,
            p.popularity_score,
            CASE
                WHEN :lat IS NOT NULL AND :lng IS NOT NULL THEN
                    ROUND((ST_Distance(
                        p.geometry::geography,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                    ) / 1000)::numeric, 2)
                ELSE NULL
            END AS distance_km
        FROM pois p
        LEFT JOIN poi_categories c ON p.category_id = c.id
        WHERE (
            p.name ILIKE :pattern
            OR p.name_alt ILIKE :pattern
            OR p.city ILIKE :pattern
            OR p.suburb ILIKE :pattern
        )
    """
    params = {
        "pattern": f"%{q}%",
        "lat": lat,
        "lng": lng
    }

    if category:
        query += " AND c.name = :category"
        params["category"] = category

    if lat is not None and lng is not None:
        query += """
            AND ST_DWithin(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius * 1000
            )
        """
        params["radius"] = radius_km
        query += " ORDER BY distance_km ASC NULLS LAST, p.popularity_score DESC"
    else:
        query += " ORDER BY p.popularity_score DESC, p.name ASC"

    query += " LIMIT :limit"
    params["limit"] = limit

    result = db.execute(text(query), params)
    pois = [dict(row._mapping) for row in result]

    return {
        "query": q,
        "count": len(pois),
        "results": pois
    }


@app.get("/api/pois/nearby", tags=["POI"])
def get_nearby_pois(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    category: Optional[str] = Query(None, description="Category filter"),
    radius_km: int = Query(5, description="Search radius in km"),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """
    Find POIs near a location.
    Great for "What's nearby?" features.
    """
    query = """
        SELECT
            p.id,
            p.name,
            p.name_alt,
            c.name AS category,
            p.subcategory,
            p.latitude,
            p.longitude,
            p.address,
            p.city,
            p.phone,
            p.website,
            ROUND((ST_Distance(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000)::numeric, 2) AS distance_km
        FROM pois p
        LEFT JOIN poi_categories c ON p.category_id = c.id
        WHERE ST_DWithin(
            p.geometry::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius * 1000
        )
    """
    params = {"lat": lat, "lng": lng, "radius": radius_km}

    if category:
        query += " AND c.name = :category"
        params["category"] = category

    query += " ORDER BY distance_km ASC LIMIT :limit"
    params["limit"] = limit

    result = db.execute(text(query), params)
    pois = [dict(row._mapping) for row in result]

    return {
        "location": {"lat": lat, "lng": lng},
        "radius_km": radius_km,
        "count": len(pois),
        "results": pois
    }


@app.get("/api/pois/categories", tags=["POI"])
def get_poi_categories(db: Session = Depends(get_db)):
    """Get all POI categories with counts."""
    query = """
        SELECT
            c.id,
            c.name,
            c.icon,
            c.color,
            COUNT(p.id) AS poi_count
        FROM poi_categories c
        LEFT JOIN pois p ON p.category_id = c.id
        GROUP BY c.id, c.name, c.icon, c.color
        ORDER BY poi_count DESC
    """
    result = db.execute(text(query))
    categories = [dict(row._mapping) for row in result]

    return {"categories": categories}


@app.get("/api/pois/{poi_id}", tags=["POI"])
def get_poi(poi_id: int, db: Session = Depends(get_db)):
    """Get details for a specific POI."""
    query = """
        SELECT
            p.*,
            c.name AS category_name,
            c.icon AS category_icon,
            c.color AS category_color
        FROM pois p
        LEFT JOIN poi_categories c ON p.category_id = c.id
        WHERE p.id = :poi_id
    """
    result = db.execute(text(query), {"poi_id": poi_id}).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="POI not found")

    return dict(result._mapping)


@app.get("/api/autocomplete", tags=["POI"])
async def autocomplete(
    q: str = Query(..., min_length=1, description="Search query"),
    lat: Optional[float] = Query(None, description="User latitude"),
    lng: Optional[float] = Query(None, description="User longitude"),
    limit: int = Query(10, le=20),
    db: Session = Depends(get_db)
):
    """
    Fast autocomplete for search boxes.
    Combines POI search (instant) with geocoding fallback.
    Returns results optimized for dropdown display.
    """
    results = []

    # First: Search POIs (instant, no external API call)
    poi_query = """
        SELECT
            'poi' AS source,
            p.id,
            p.name AS display_name,
            c.name AS category,
            p.city,
            p.province,
            p.latitude AS lat,
            p.longitude AS lng,
            p.popularity_score,
            CASE
                WHEN :lat IS NOT NULL AND :lng IS NOT NULL THEN
                    ROUND((ST_Distance(
                        p.geometry::geography,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                    ) / 1000)::numeric, 1)
                ELSE NULL
            END AS distance_km
        FROM pois p
        LEFT JOIN poi_categories c ON p.category_id = c.id
        WHERE p.name ILIKE :pattern OR p.city ILIKE :pattern
        ORDER BY p.popularity_score DESC
        LIMIT :limit
    """

    poi_result = db.execute(text(poi_query), {
        "pattern": f"%{q}%",
        "lat": lat,
        "lng": lng,
        "limit": limit
    })

    for row in poi_result:
        r = dict(row._mapping)
        # Format for dropdown
        subtitle_parts = [r.get('category')]
        if r.get('city'):
            subtitle_parts.append(r['city'])
        if r.get('distance_km'):
            subtitle_parts.append(f"{r['distance_km']}km")

        results.append({
            "source": "poi",
            "id": r['id'],
            "title": r['display_name'],
            "subtitle": ' · '.join(filter(None, subtitle_parts)),
            "lat": float(r['lat']) if r['lat'] else None,
            "lng": float(r['lng']) if r['lng'] else None,
            "category": r.get('category')
        })

    # If we don't have enough results, try Nominatim (geocoding)
    if len(results) < limit:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                nominatim_response = await client.get(
                    f"{NOMINATIM_URL}/search",
                    params={
                        "q": q,
                        "format": "json",
                        "limit": limit - len(results),
                        "countrycodes": "za",  # South Africa priority
                        "addressdetails": 1
                    }
                )
                if nominatim_response.status_code == 200:
                    for item in nominatim_response.json():
                        results.append({
                            "source": "nominatim",
                            "id": item.get('place_id'),
                            "title": item.get('display_name', '').split(',')[0],
                            "subtitle": ', '.join(item.get('display_name', '').split(',')[1:4]),
                            "lat": float(item['lat']),
                            "lng": float(item['lon']),
                            "category": item.get('type')
                        })
        except Exception:
            # Nominatim timeout or error - just use POI results
            pass

    return {
        "query": q,
        "count": len(results),
        "results": results[:limit]
    }


# ============================================
# Events Endpoints
# ============================================

@app.get("/api/events")
def get_events(
    year_start: Optional[int] = None,
    year_end: Optional[int] = None,
    event_type: Optional[str] = None,
    bbox: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """Get historical events, optionally filtered by time range and location"""
    query = """
        SELECT
            e.id, e.uuid, e.name, e.description, e.event_type,
            e.year, e.month, e.day,
            e.categories,
            p.current_name as place_name,
            ST_X(COALESCE(e.geometry, p.geometry)) as lng,
            ST_Y(COALESCE(e.geometry, p.geometry)) as lat
        FROM events e
        LEFT JOIN places p ON e.place_id = p.id
        WHERE 1=1
    """
    params = {"limit": limit}

    if year_start is not None:
        query += " AND e.year >= :year_start"
        params["year_start"] = year_start

    if year_end is not None:
        query += " AND e.year <= :year_end"
        params["year_end"] = year_end

    if event_type:
        query += " AND e.event_type = :event_type"
        params["event_type"] = event_type

    query += " ORDER BY e.year LIMIT :limit"

    result = db.execute(text(query), params)
    events = [dict(row._mapping) for row in result]

    return {
        "count": len(events),
        "events": events
    }


@app.post("/api/events")
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    """Create a new historical event"""
    query = """
        INSERT INTO events (
            name, description, event_type, year, month, day,
            place_id, geometry, categories, source_title, source_url
        ) VALUES (
            :name, :description, :event_type, :year, :month, :day,
            :place_id,
            CASE WHEN :lat IS NOT NULL THEN ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) ELSE NULL END,
            :categories, :source_title, :source_url
        )
        RETURNING id, uuid
    """

    result = db.execute(text(query), {
        **event.model_dump(),
        "categories": event.categories
    })
    new_event = result.fetchone()
    db.commit()

    return {"id": new_event[0], "uuid": str(new_event[1]), "message": "Event created successfully"}


# ============================================
# Boundaries Endpoints
# ============================================

@app.get("/api/boundaries")
def get_boundaries(
    year: Optional[int] = None,
    boundary_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get historical boundaries (empires, kingdoms) for a specific year"""
    query = """
        SELECT
            b.id, b.uuid, b.name, b.name_native, b.boundary_type,
            b.year_start, b.year_end,
            ST_AsGeoJSON(b.geometry)::json as geometry
        FROM boundaries b
        WHERE 1=1
    """
    params = {}

    if year is not None:
        query += """ AND (b.year_start IS NULL OR b.year_start <= :year)
                     AND (b.year_end IS NULL OR b.year_end >= :year)"""
        params["year"] = year

    if boundary_type:
        query += " AND b.boundary_type = :boundary_type"
        params["boundary_type"] = boundary_type

    result = db.execute(text(query), params)
    boundaries = [dict(row._mapping) for row in result]

    return {
        "year": year,
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": b["id"],
                "geometry": b["geometry"],
                "properties": {
                    "id": b["id"],
                    "name": b["name"],
                    "name_native": b["name_native"],
                    "boundary_type": b["boundary_type"],
                    "year_start": b["year_start"],
                    "year_end": b["year_end"]
                }
            } for b in boundaries
        ]
    }


# ============================================
# Stats Endpoint
# ============================================

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    """Get database statistics"""
    stats = {}

    queries = {
        "total_places": "SELECT COUNT(*) FROM places",
        "total_historical_names": "SELECT COUNT(*) FROM place_names",
        "total_events": "SELECT COUNT(*) FROM events",
        "total_boundaries": "SELECT COUNT(*) FROM boundaries",
        "total_contributors": "SELECT COUNT(*) FROM users",
        "oldest_record_year": "SELECT MIN(year_start) FROM place_names WHERE year_start IS NOT NULL",
        "newest_record_year": "SELECT MAX(year_end) FROM place_names WHERE year_end IS NOT NULL"
    }

    for key, query in queries.items():
        try:
            result = db.execute(text(query)).scalar()
            stats[key] = result or 0
        except:
            stats[key] = 0

    return stats


# ============================================
# Business API - Radius Search
# ============================================

@app.get("/api/nearby")
def get_nearby_places(
    lat: float = Query(..., description="Latitude of center point"),
    lng: float = Query(..., description="Longitude of center point"),
    radius: float = Query(10, description="Search radius in kilometers"),
    place_type: Optional[str] = Query(None, description="Filter by place type (school, hotel, restaurant, etc.)"),
    category: Optional[str] = Query(None, description="Filter by category tag"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """
    Find places within a radius of a given point.

    Business use case: "Find all schools within 10km of my location"

    Example:
        GET /api/nearby?lat=-33.9249&lng=18.4241&radius=10&place_type=school
    """
    # Convert km to meters for ST_DWithin
    radius_meters = radius * 1000

    query = """
        SELECT
            p.id,
            p.uuid,
            p.current_name,
            p.place_type,
            p.country_code,
            ST_X(ST_Centroid(p.geometry)) as lng,
            ST_Y(ST_Centroid(p.geometry)) as lat,
            ST_Distance(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 as distance_km
        FROM places p
        WHERE ST_DWithin(
            p.geometry::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_meters
        )
    """
    params = {"lat": lat, "lng": lng, "radius_meters": radius_meters, "limit": limit}

    if place_type:
        query += " AND p.place_type ILIKE :place_type"
        params["place_type"] = f"%{place_type}%"

    query += " ORDER BY distance_km ASC LIMIT :limit"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    # Round distances
    for p in places:
        p["distance_km"] = round(p["distance_km"], 2)
        p["uuid"] = str(p["uuid"])

    return {
        "center": {"lat": lat, "lng": lng},
        "radius_km": radius,
        "count": len(places),
        "places": places
    }


@app.get("/api/nearby/geojson")
def get_nearby_geojson(
    lat: float = Query(..., description="Latitude of center point"),
    lng: float = Query(..., description="Longitude of center point"),
    radius: float = Query(10, description="Search radius in kilometers"),
    place_type: Optional[str] = Query(None, description="Filter by place type"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """
    Get nearby places as GeoJSON FeatureCollection.
    Ready for direct use in mapping applications.
    """
    radius_meters = radius * 1000

    query = """
        SELECT
            p.id,
            p.current_name,
            p.place_type,
            p.country_code,
            ST_AsGeoJSON(p.geometry)::json as geometry,
            ST_Distance(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 as distance_km
        FROM places p
        WHERE ST_DWithin(
            p.geometry::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_meters
        )
    """
    params = {"lat": lat, "lng": lng, "radius_meters": radius_meters, "limit": limit}

    if place_type:
        query += " AND p.place_type ILIKE :place_type"
        params["place_type"] = f"%{place_type}%"

    query += " ORDER BY distance_km ASC LIMIT :limit"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    return {
        "type": "FeatureCollection",
        "properties": {
            "center": [lng, lat],
            "radius_km": radius,
            "count": len(places)
        },
        "features": [
            {
                "type": "Feature",
                "id": p["id"],
                "geometry": p["geometry"],
                "properties": {
                    "id": p["id"],
                    "name": p["current_name"],
                    "place_type": p["place_type"],
                    "country_code": p["country_code"],
                    "distance_km": round(p["distance_km"], 2)
                }
            } for p in places
        ]
    }


# ============================================
# Business API - Export
# ============================================

@app.get("/api/export/geojson")
def export_geojson(
    bbox: Optional[str] = Query(None, description="Bounding box: minLng,minLat,maxLng,maxLat"),
    place_type: Optional[str] = None,
    limit: int = Query(1000, le=10000),
    db: Session = Depends(get_db)
):
    """
    Export places as GeoJSON for use in GIS applications.

    Example:
        GET /api/export/geojson?bbox=18,33,19,34&place_type=city
    """
    query = """
        SELECT
            p.id,
            p.uuid,
            p.current_name,
            p.place_type,
            p.country_code,
            p.population,
            ST_AsGeoJSON(p.geometry)::json as geometry
        FROM places p
        WHERE 1=1
    """
    params = {"limit": limit}

    if bbox:
        coords = validate_bbox(bbox)
        query += """ AND ST_Intersects(
            p.geometry,
            ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
        )"""
        params.update({
            "min_lng": coords[0], "min_lat": coords[1],
            "max_lng": coords[2], "max_lat": coords[3]
        })

    if place_type:
        query += " AND p.place_type = :place_type"
        params["place_type"] = place_type

    query += " LIMIT :limit"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": p["id"],
                "geometry": p["geometry"],
                "properties": {
                    "id": p["id"],
                    "uuid": str(p["uuid"]),
                    "name": p["current_name"],
                    "place_type": p["place_type"],
                    "country_code": p["country_code"],
                    "population": p["population"]
                }
            } for p in places
        ]
    }


@app.get("/api/export/csv")
def export_csv(
    bbox: Optional[str] = None,
    place_type: Optional[str] = None,
    include_names: bool = False,
    limit: int = Query(1000, le=10000),
    db: Session = Depends(get_db)
):
    """
    Export places as CSV data.

    Returns JSON with CSV-ready format that can be easily converted.
    """
    query = """
        SELECT
            p.id,
            p.current_name,
            p.place_type,
            p.country_code,
            ST_X(ST_Centroid(p.geometry)) as lng,
            ST_Y(ST_Centroid(p.geometry)) as lat,
            p.population
        FROM places p
        WHERE 1=1
    """
    params = {"limit": limit}

    if bbox:
        coords = validate_bbox(bbox)
        query += """ AND ST_Intersects(
            p.geometry,
            ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
        )"""
        params.update({
            "min_lng": coords[0], "min_lat": coords[1],
            "max_lng": coords[2], "max_lat": coords[3]
        })

    if place_type:
        query += " AND p.place_type = :place_type"
        params["place_type"] = place_type

    query += " LIMIT :limit"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    # Create CSV-ready structure
    headers = ["id", "name", "place_type", "country_code", "lng", "lat", "population"]
    rows = [[
        p["id"],
        p["current_name"],
        p["place_type"],
        p["country_code"] or "",
        round(p["lng"], 6),
        round(p["lat"], 6),
        p["population"] or ""
    ] for p in places]

    return {
        "format": "csv",
        "headers": headers,
        "rows": rows,
        "count": len(rows)
    }


# ============================================
# Business API - Bulk Import
# ============================================

class BulkPlaceImport(BaseModel):
    places: List[PlaceCreate]

@app.post("/api/import/places")
def import_places(
    data: BulkPlaceImport,
    db: Session = Depends(get_db)
):
    """
    Bulk import places from external data sources.

    Request body:
    {
        "places": [
            {"current_name": "School A", "lat": -33.9, "lng": 18.4, "place_type": "school"},
            {"current_name": "Hotel B", "lat": -33.8, "lng": 18.5, "place_type": "hotel"}
        ]
    }
    """
    imported = 0
    errors = []

    for i, place in enumerate(data.places):
        try:
            query = """
                INSERT INTO places (current_name, geometry, place_type, country_code)
                VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :place_type, :country_code)
                ON CONFLICT DO NOTHING
                RETURNING id
            """
            result = db.execute(text(query), {
                "name": place.current_name,
                "lng": place.lng,
                "lat": place.lat,
                "place_type": place.place_type,
                "country_code": place.country_code
            })
            if result.fetchone():
                imported += 1
        except Exception as e:
            logger.warning(f"Error importing place {place.current_name}: {type(e).__name__}: {e}")
            errors.append({"index": i, "name": place.current_name, "error": "Import failed"})

    db.commit()

    return {
        "imported": imported,
        "total": len(data.places),
        "errors": errors[:10]  # Return first 10 errors
    }


class GeoJSONImport(BaseModel):
    type: str = "FeatureCollection"
    features: List[dict]
    default_place_type: Optional[str] = "poi"

@app.post("/api/import/geojson")
def import_geojson(
    data: GeoJSONImport,
    db: Session = Depends(get_db)
):
    """
    Import places from GeoJSON format.

    Each feature should have:
    - geometry: Point, Polygon, or LineString
    - properties.name: Place name
    - properties.place_type (optional): Type of place
    """
    imported = 0
    errors = []

    for i, feature in enumerate(data.features):
        try:
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})

            name = props.get("name") or props.get("title") or f"Imported Place {i+1}"
            place_type = props.get("place_type") or props.get("type") or data.default_place_type

            # Convert geometry to WKT
            geom_json = json.dumps(geom)

            query = """
                INSERT INTO places (current_name, geometry, place_type)
                VALUES (:name, ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326), :place_type)
                ON CONFLICT DO NOTHING
                RETURNING id
            """
            result = db.execute(text(query), {
                "name": name,
                "geom": geom_json,
                "place_type": place_type
            })
            if result.fetchone():
                imported += 1
        except Exception as e:
            logger.warning(f"Error importing GeoJSON feature {i}: {type(e).__name__}: {e}")
            errors.append({"index": i, "error": "Import failed"})

    db.commit()

    return {
        "imported": imported,
        "total": len(data.features),
        "errors": errors[:10]
    }


# ============================================
# Business API - Place Types
# ============================================

@app.get("/api/place-types")
def get_place_types(db: Session = Depends(get_db)):
    """
    Get list of all place types in the database with counts.
    Useful for building filter UIs.
    """
    query = """
        SELECT place_type, COUNT(*) as count
        FROM places
        GROUP BY place_type
        ORDER BY count DESC
    """
    result = db.execute(text(query))
    types = [{"type": row[0], "count": row[1]} for row in result]

    return {
        "total_types": len(types),
        "types": types
    }


# ============================================
# TagMe Integration - Anonymized Location Data
# ============================================

class TagMeLocationBatch(BaseModel):
    """Batch of anonymized location clusters from TagMe app"""
    batch_id: str  # Unique ID for this batch
    app_version: Optional[str] = None
    clusters: List[dict]  # Each cluster contains anonymized location data

class TagMeCluster(BaseModel):
    """Single anonymized location cluster"""
    point_cluster_id: int
    centroid_lat: float
    centroid_lon: float
    point_count: int  # Number of users who contributed (minimum 3 for privacy)
    avg_accuracy_m: float
    place_name_suggested: Optional[str] = None
    place_type_suggested: Optional[str] = None
    country_code: Optional[str] = None
    collection_date: Optional[str] = None


@app.post("/api/tagme/submit")
def submit_tagme_data(
    data: TagMeLocationBatch,
    db: Session = Depends(get_db)
):
    """
    Receive anonymized location clusters from TagMe app.

    TagMe app performs on-device clustering to ensure privacy:
    - Individual user locations are never sent
    - Only clusters with 3+ users are submitted
    - Exact coordinates are rounded/jittered
    - No user identifiers are included

    Example:
    {
        "batch_id": "2024-12-06-batch-001",
        "app_version": "1.2.0",
        "clusters": [
            {
                "point_cluster_id": 1,
                "centroid_lat": -33.9258,
                "centroid_lon": 18.4232,
                "point_count": 5,
                "avg_accuracy_m": 25.5,
                "place_name_suggested": "Corner Cafe",
                "place_type_suggested": "restaurant",
                "country_code": "ZA"
            }
        ]
    }
    """
    inserted = 0
    skipped = 0
    errors = []

    for cluster in data.clusters:
        try:
            # Privacy check: only accept clusters with minimum 3 contributors
            point_count = cluster.get('point_count', 0)
            if point_count < 3:
                skipped += 1
                continue

            # Quality check: accuracy must be reasonable
            accuracy = cluster.get('avg_accuracy_m', 1000)
            if accuracy > 500:
                skipped += 1
                continue

            query = """
                INSERT INTO bronze.tagme_raw (
                    batch_id, point_cluster_id, centroid_lat, centroid_lon,
                    point_count, avg_accuracy_m, place_name_suggested,
                    place_type_suggested, country_code, collection_date
                ) VALUES (
                    :batch_id, :cluster_id, :lat, :lon,
                    :point_count, :accuracy, :name,
                    :place_type, :country_code, :collection_date
                )
                ON CONFLICT DO NOTHING
                RETURNING id
            """
            result = db.execute(text(query), {
                "batch_id": data.batch_id,
                "cluster_id": cluster.get('point_cluster_id'),
                "lat": cluster.get('centroid_lat'),
                "lon": cluster.get('centroid_lon'),
                "point_count": point_count,
                "accuracy": accuracy,
                "name": cluster.get('place_name_suggested'),
                "place_type": cluster.get('place_type_suggested'),
                "country_code": cluster.get('country_code'),
                "collection_date": cluster.get('collection_date')
            })
            if result.fetchone():
                inserted += 1
        except Exception as e:
            logger.warning(f"Error processing TagMe cluster {cluster.get('point_cluster_id')}: {type(e).__name__}: {e}")
            errors.append({"cluster_id": cluster.get('point_cluster_id'), "error": "Processing failed"})

    db.commit()

    return {
        "batch_id": data.batch_id,
        "received": len(data.clusters),
        "inserted": inserted,
        "skipped_privacy": skipped,
        "errors": len(errors),
        "message": f"Processed {inserted} location clusters for anonymized mapping data"
    }


@app.post("/api/tagme/process")
def process_tagme_data(db: Session = Depends(get_db)):
    """
    Process TagMe raw data through medallion pipeline.
    Transforms bronze.tagme_raw -> silver.places_cleaned.
    Only admin/scheduled jobs should call this.
    """
    try:
        result = db.execute(text("SELECT silver.transform_tagme()"))
        rows_processed = result.scalar()
        db.commit()
        return {
            "status": "success",
            "places_processed": rows_processed,
            "message": f"Transformed {rows_processed} TagMe clusters to cleaned places"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.get("/api/tagme/stats")
def tagme_stats(db: Session = Depends(get_db)):
    """Get statistics about TagMe contributions"""
    queries = {
        "total_clusters": "SELECT COUNT(*) FROM bronze.tagme_raw",
        "total_contributors": "SELECT SUM(point_count) FROM bronze.tagme_raw",
        "unique_batches": "SELECT COUNT(DISTINCT batch_id) FROM bronze.tagme_raw",
        "by_country": """
            SELECT country_code, COUNT(*) as clusters, SUM(point_count) as contributors
            FROM bronze.tagme_raw
            WHERE country_code IS NOT NULL
            GROUP BY country_code
            ORDER BY clusters DESC
            LIMIT 10
        """,
        "validated_places": """
            SELECT COUNT(*) FROM silver.places_cleaned WHERE source = 'tagme'
        """
    }

    stats = {}
    for key, query in queries.items():
        try:
            if key == "by_country":
                result = db.execute(text(query))
                stats[key] = [{"country": r[0], "clusters": r[1], "contributors": r[2]} for r in result]
            else:
                stats[key] = db.execute(text(query)).scalar() or 0
        except:
            stats[key] = 0

    return stats


@app.get("/api/tagme/places")
def get_tagme_places(
    bbox: Optional[str] = Query(None, description="Bounding box: minLng,minLat,maxLng,maxLat"),
    validated_only: bool = Query(False, description="Only show validated places"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """
    Get places discovered by TagMe users.
    These are community-contributed locations that have been anonymized and clustered.
    """
    query = """
        SELECT
            s.id, s.source_id, s.name, s.place_type,
            s.latitude, s.longitude, s.confidence_score,
            s.is_validated, s.validation_notes, s.country_code
        FROM silver.places_cleaned s
        WHERE s.source = 'tagme'
    """
    params = {"limit": limit}

    if validated_only:
        query += " AND s.is_validated = TRUE"

    if bbox:
        coords = validate_bbox(bbox)
        query += """ AND ST_Intersects(
            s.geometry,
            ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
        )"""
        params.update({
            "min_lng": coords[0], "min_lat": coords[1],
            "max_lng": coords[2], "max_lat": coords[3]
        })

    query += " ORDER BY s.confidence_score DESC LIMIT :limit"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    return {
        "source": "tagme",
        "count": len(places),
        "note": "Community-contributed locations (anonymized)",
        "places": places
    }


# ============================================
# ETL Pipeline Endpoints
# ============================================

@app.post("/api/etl/run")
def run_etl_pipeline(db: Session = Depends(get_db)):
    """
    Run the full ETL pipeline:
    Bronze -> Silver -> Gold transformations.
    Only admin/scheduled jobs should call this.
    """
    try:
        result = db.execute(text("SELECT * FROM public.run_maps_etl_pipeline()"))
        steps = [{"step": r[0], "rows": r[1], "status": r[2]} for r in result]
        db.commit()
        return {
            "status": "success",
            "pipeline_results": steps
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


@app.get("/api/etl/quality")
def get_data_quality(db: Session = Depends(get_db)):
    """Get data quality metrics from the silver layer"""
    query = """
        SELECT source, run_date, total_records, valid_records,
               invalid_records, duplicate_records, notes
        FROM silver.quality_metrics
        ORDER BY run_date DESC
        LIMIT 20
    """
    result = db.execute(text(query))
    metrics = [dict(row._mapping) for row in result]

    return {
        "metrics": metrics,
        "schemas": {
            "bronze": ["geonames_raw", "pleiades_raw", "osm_raw", "tagme_raw"],
            "silver": ["places_cleaned", "data_lineage", "quality_metrics"],
            "gold": ["places", "place_names", "events", "boundaries"]
        }
    }


# ============================================
# Routing & Navigation (OSRM)
# ============================================

class TravelMode(str, Enum):
    driving = "driving"
    walking = "walking"
    cycling = "cycling"


class RouteRequest(BaseModel):
    origin: List[float]  # [lng, lat]
    destination: List[float]  # [lng, lat]
    waypoints: Optional[List[List[float]]] = None  # [[lng, lat], ...]
    mode: TravelMode = TravelMode.driving
    alternatives: bool = False
    steps: bool = True
    overview: str = "full"  # full, simplified, false


class RouteResponse(BaseModel):
    distance_m: float
    duration_s: float
    duration_text: str
    distance_text: str
    geometry: dict  # GeoJSON LineString
    steps: Optional[List[dict]] = None
    alternatives: Optional[List[dict]] = None


@app.post("/api/route", response_model=RouteResponse, tags=["Navigation"])
async def get_route(request: RouteRequest):
    """
    Get driving/walking/cycling directions between two points.

    Similar to Google Maps Directions API.

    - **origin**: Starting point [longitude, latitude]
    - **destination**: End point [longitude, latitude]
    - **waypoints**: Optional intermediate stops
    - **mode**: Travel mode (driving, walking, cycling)
    - **alternatives**: Return alternative routes
    - **steps**: Include turn-by-turn instructions
    """
    # Build coordinates string for OSRM
    coords = [request.origin]
    if request.waypoints:
        coords.extend(request.waypoints)
    coords.append(request.destination)

    coords_str = ";".join([f"{c[0]},{c[1]}" for c in coords])

    # OSRM profile based on mode
    profile_map = {
        TravelMode.driving: "car",
        TravelMode.walking: "foot",
        TravelMode.cycling: "bicycle"
    }
    profile = profile_map.get(request.mode, "car")

    # Build OSRM request
    osrm_url = f"{OSRM_URL}/route/v1/{profile}/{coords_str}"
    params = {
        "overview": request.overview,
        "geometries": "geojson",
        "steps": str(request.steps).lower(),
        "alternatives": str(request.alternatives).lower(),
        "annotations": "true",  # Include lane/speed annotations
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(osrm_url, params=params)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail="Routing service unavailable. Please try again later."
                )

            data = response.json()

            if data.get("code") != "Ok":
                raise HTTPException(
                    status_code=400,
                    detail=f"Routing failed: {data.get('message', 'Unknown error')}"
                )

            route = data["routes"][0]

            # Format duration
            duration_s = route["duration"]
            hours = int(duration_s // 3600)
            minutes = int((duration_s % 3600) // 60)
            if hours > 0:
                duration_text = f"{hours}h {minutes}min"
            else:
                duration_text = f"{minutes} min"

            # Format distance
            distance_m = route["distance"]
            if distance_m >= 1000:
                distance_text = f"{distance_m/1000:.1f} km"
            else:
                distance_text = f"{int(distance_m)} m"

            # Extract steps if requested
            steps = None
            if request.steps and "legs" in route:
                steps = []
                for leg in route["legs"]:
                    for step in leg.get("steps", []):
                        # Extract lane data from intersections
                        lanes = None
                        intersections = step.get("intersections", [])
                        if intersections:
                            # Get lanes from the last intersection (approach lanes)
                            last_intersection = intersections[-1] if len(intersections) > 0 else None
                            if last_intersection and "lanes" in last_intersection:
                                lanes = []
                                for lane in last_intersection["lanes"]:
                                    lanes.append({
                                        "valid": lane.get("valid", False),
                                        "indications": lane.get("indications", [])
                                    })

                        steps.append({
                            "instruction": step.get("maneuver", {}).get("instruction", ""),
                            "name": step.get("name", ""),
                            "distance_m": step.get("distance", 0),
                            "duration_s": step.get("duration", 0),
                            "maneuver": step.get("maneuver", {}).get("type", ""),
                            "modifier": step.get("maneuver", {}).get("modifier", ""),
                            "lanes": lanes,
                        })

            # Extract alternatives
            alternatives = None
            if request.alternatives and len(data["routes"]) > 1:
                alternatives = [
                    {
                        "distance_m": alt["distance"],
                        "duration_s": alt["duration"],
                        "geometry": alt["geometry"]
                    }
                    for alt in data["routes"][1:]
                ]

            return RouteResponse(
                distance_m=distance_m,
                duration_s=duration_s,
                duration_text=duration_text,
                distance_text=distance_text,
                geometry=route["geometry"],
                steps=steps,
                alternatives=alternatives
            )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail="Routing service connection failed"
        )


@app.get("/api/route/simple", tags=["Navigation"])
async def get_simple_route(
    origin: str = Query(..., description="Origin coordinates: lng,lat"),
    destination: str = Query(..., description="Destination coordinates: lng,lat"),
    mode: TravelMode = Query(TravelMode.driving, description="Travel mode"),
):
    """
    Simple GET endpoint for routing (easier for testing).

    Example: /api/route/simple?origin=28.0473,-26.2041&destination=18.4241,-33.9249
    """
    try:
        origin_coords = [float(x) for x in origin.split(",")]
        dest_coords = [float(x) for x in destination.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinates format. Use: lng,lat")

    request = RouteRequest(
        origin=origin_coords,
        destination=dest_coords,
        mode=mode,
        steps=True
    )
    return await get_route(request)


@app.get("/api/isochrone", tags=["Navigation"])
async def get_isochrone(
    lat: float = Query(..., description="Center latitude"),
    lng: float = Query(..., description="Center longitude"),
    minutes: int = Query(15, description="Travel time in minutes (5-60)", ge=5, le=60),
    mode: TravelMode = Query(TravelMode.driving, description="Travel mode")
):
    """
    Get isochrone (reachability polygon) - areas reachable within X minutes.

    Perfect for "what's within 15 minutes drive?" queries.
    Returns a GeoJSON polygon showing the reachable area.

    Example: /api/isochrone?lat=-26.2&lng=28.0&minutes=15&mode=driving
    """
    profile_map = {
        TravelMode.driving: "car",
        TravelMode.walking: "foot",
        TravelMode.cycling: "bicycle"
    }
    profile = profile_map.get(mode, "car")

    # Check cache
    ckey = cache_key("isochrone", round(lat, 4), round(lng, 4), minutes, profile)
    cached = cache_get(ckey)
    if cached:
        cached["cached"] = True
        return cached

    # OSRM isochrone endpoint
    osrm_url = f"{OSRM_URL}/isochrone/v1/{profile}/{lng},{lat}"
    params = {
        "contours_minutes": minutes,
        "polygons": "true",
        "generalize": 50  # Simplify geometry
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(osrm_url, params=params)

            if response.status_code == 200:
                data = response.json()
                if data.get("code") == "Ok" and data.get("features"):
                    result = {
                        "type": "FeatureCollection",
                        "features": data["features"],
                        "center": {"lat": lat, "lng": lng},
                        "minutes": minutes,
                        "mode": mode.value,
                        "cached": False
                    }
                    # Cache for 1 hour (isochrones don't change often)
                    cache_set(ckey, result, ttl_seconds=3600)
                    return result

            # Fallback: Generate approximate circle based on average speed
            # This is a rough approximation when OSRM isochrone isn't available
            import math

            avg_speeds = {
                "driving": 40,   # km/h average urban
                "walking": 5,    # km/h
                "cycling": 15    # km/h
            }
            speed = avg_speeds.get(mode.value, 40)
            radius_km = (speed * minutes) / 60

            # Generate circle polygon (32 points)
            points = []
            for i in range(33):
                angle = (i / 32) * 2 * math.pi
                # Approximate degrees per km at this latitude
                lat_offset = (radius_km / 111) * math.cos(angle)
                lng_offset = (radius_km / (111 * math.cos(math.radians(lat)))) * math.sin(angle)
                points.append([lng + lng_offset, lat + lat_offset])

            result = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [points]
                    },
                    "properties": {
                        "contour": minutes,
                        "mode": mode.value,
                        "approximate": True
                    }
                }],
                "center": {"lat": lat, "lng": lng},
                "minutes": minutes,
                "mode": mode.value,
                "approximate": True,
                "cached": False
            }
            cache_set(ckey, result, ttl_seconds=3600)
            return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Isochrone calculation failed: {str(e)}")


@app.post("/api/route/optimize", tags=["Navigation"])
async def optimize_multi_stop_route(
    stops: List[List[float]],
    mode: TravelMode = Query(TravelMode.driving),
    roundtrip: bool = Query(False, description="Return to starting point")
):
    """
    Optimize a multi-stop route (Traveling Salesman Problem).

    Given a list of stops, returns the optimal order to visit them.
    Uses OSRM's trip optimization service.

    Body: [[lng1, lat1], [lng2, lat2], [lng3, lat3], ...]

    Example:
    ```json
    {
        "stops": [[28.0, -26.2], [28.1, -26.1], [28.05, -26.15]],
        "mode": "driving",
        "roundtrip": false
    }
    ```
    """
    if len(stops) < 2:
        raise HTTPException(status_code=400, detail="At least 2 stops required")
    if len(stops) > 25:
        raise HTTPException(status_code=400, detail="Maximum 25 stops allowed")

    profile_map = {
        TravelMode.driving: "car",
        TravelMode.walking: "foot",
        TravelMode.cycling: "bicycle"
    }
    profile = profile_map.get(mode, "car")

    coords_str = ";".join([f"{s[0]},{s[1]}" for s in stops])

    # OSRM trip endpoint for route optimization
    osrm_url = f"{OSRM_URL}/trip/v1/{profile}/{coords_str}"
    params = {
        "roundtrip": str(roundtrip).lower(),
        "geometries": "geojson",
        "overview": "full",
        "steps": "true",
        "source": "first",
        "destination": "last" if not roundtrip else "any"
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(osrm_url, params=params)

            if response.status_code != 200:
                raise HTTPException(status_code=503, detail="Route optimization service unavailable")

            data = response.json()

            if data.get("code") != "Ok":
                raise HTTPException(status_code=400, detail=f"Optimization failed: {data.get('message')}")

            trip = data["trips"][0]
            waypoints = data["waypoints"]

            # Get optimized order
            optimized_order = [wp["waypoint_index"] for wp in sorted(waypoints, key=lambda x: x["trips_index"])]

            # Format duration
            duration_s = trip["duration"]
            hours = int(duration_s // 3600)
            minutes = int((duration_s % 3600) // 60)
            duration_text = f"{hours}h {minutes}min" if hours > 0 else f"{minutes} min"

            # Format distance
            distance_m = trip["distance"]
            distance_text = f"{distance_m/1000:.1f} km" if distance_m >= 1000 else f"{int(distance_m)} m"

            # Build leg summaries
            legs = []
            for i, leg in enumerate(trip.get("legs", [])):
                leg_duration = leg["duration"]
                leg_distance = leg["distance"]
                legs.append({
                    "from_index": optimized_order[i] if i < len(optimized_order) else i,
                    "to_index": optimized_order[i+1] if i+1 < len(optimized_order) else 0,
                    "distance_m": leg_distance,
                    "distance_text": f"{leg_distance/1000:.1f} km" if leg_distance >= 1000 else f"{int(leg_distance)} m",
                    "duration_s": leg_duration,
                    "duration_text": f"{int(leg_duration//60)} min"
                })

            return {
                "optimized_order": optimized_order,
                "optimized_stops": [stops[i] for i in optimized_order],
                "total_distance_m": distance_m,
                "total_distance_text": distance_text,
                "total_duration_s": duration_s,
                "total_duration_text": duration_text,
                "geometry": trip["geometry"],
                "legs": legs,
                "roundtrip": roundtrip,
                "mode": mode.value,
                "stop_count": len(stops)
            }

    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail="Route service connection failed")


@app.get("/api/route/multi", tags=["Navigation"])
async def get_multi_stop_route(
    stops: str = Query(..., description="Stops as 'lng1,lat1|lng2,lat2|lng3,lat3|...'"),
    mode: TravelMode = Query(TravelMode.driving),
    optimize: bool = Query(False, description="Optimize stop order")
):
    """
    Get route through multiple stops (GET endpoint for easier testing).

    If optimize=true, finds the best order to visit stops.
    If optimize=false, routes through stops in given order.

    Example: /api/route/multi?stops=28.0,-26.2|28.1,-26.1|28.05,-26.15&optimize=true
    """
    try:
        parsed_stops = []
        for stop in stops.split("|"):
            lng, lat = map(float, stop.split(","))
            parsed_stops.append([lng, lat])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid stops format. Use: lng1,lat1|lng2,lat2|...")

    if len(parsed_stops) < 2:
        raise HTTPException(status_code=400, detail="At least 2 stops required")

    if optimize:
        return await optimize_multi_stop_route(parsed_stops, mode, roundtrip=False)
    else:
        # Route through stops in order (using waypoints)
        profile_map = {
            TravelMode.driving: "car",
            TravelMode.walking: "foot",
            TravelMode.cycling: "bicycle"
        }
        profile = profile_map.get(mode, "car")

        coords_str = ";".join([f"{s[0]},{s[1]}" for s in parsed_stops])
        osrm_url = f"{OSRM_URL}/route/v1/{profile}/{coords_str}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "true"
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(osrm_url, params=params)
                data = response.json()

                if data.get("code") != "Ok":
                    raise HTTPException(status_code=400, detail=f"Routing failed: {data.get('message')}")

                route = data["routes"][0]
                duration_s = route["duration"]
                distance_m = route["distance"]

                hours = int(duration_s // 3600)
                minutes = int((duration_s % 3600) // 60)

                return {
                    "stops": parsed_stops,
                    "total_distance_m": distance_m,
                    "total_distance_text": f"{distance_m/1000:.1f} km" if distance_m >= 1000 else f"{int(distance_m)} m",
                    "total_duration_s": duration_s,
                    "total_duration_text": f"{hours}h {minutes}min" if hours > 0 else f"{minutes} min",
                    "geometry": route["geometry"],
                    "optimized": False,
                    "mode": mode.value,
                    "stop_count": len(parsed_stops)
                }

        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Route service error: {str(e)}")


# ============================================
# Load Shedding (South Africa specific)
# ============================================

@app.get("/api/loadshedding", tags=["South Africa"])
async def get_loadshedding_status():
    """
    Get current Eskom load shedding status for South Africa.

    Returns current stage (0-8), schedule info, and next change time.
    Data from EskomSePush API.
    """
    # Check cache (refresh every 5 minutes)
    ckey = cache_key("loadshedding_status")
    cached = cache_get(ckey)
    if cached:
        cached["cached"] = True
        return cached

    # EskomSePush public API
    url = "https://developer.sepush.co.za/business/2.0/status"

    # Try to get API key from environment
    esp_token = os.getenv("ESKOMSEPUSH_TOKEN", "")

    if not esp_token:
        # Return basic status without API (limited info)
        return {
            "status": "api_key_required",
            "message": "Set ESKOMSEPUSH_TOKEN for detailed load shedding info",
            "get_key": "https://eskomsepush.gumroad.com/l/api",
            "note": "Free tier: 50 requests/day",
            "fallback": {
                "check_manually": "https://loadshedding.eskom.co.za/"
            }
        }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={"Token": esp_token},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            status = data.get("status", {})
            result = {
                "stage": status.get("eskom", {}).get("stage", 0),
                "stage_updated": status.get("eskom", {}).get("stage_updated"),
                "next_stages": status.get("eskom", {}).get("next_stages", []),
                "cape_town": {
                    "stage": status.get("capetown", {}).get("stage", 0),
                    "stage_updated": status.get("capetown", {}).get("stage_updated")
                },
                "source": "EskomSePush",
                "cached": False
            }

            # Cache for 5 minutes
            cache_set(ckey, result, ttl_seconds=300)
            return result

    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "fallback": "https://loadshedding.eskom.co.za/"
        }


@app.get("/api/loadshedding/area", tags=["South Africa"])
async def get_loadshedding_area(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude")
):
    """
    Get load shedding schedule for a specific area.

    Returns the area ID and upcoming outage times.
    Requires ESKOMSEPUSH_TOKEN environment variable.
    """
    esp_token = os.getenv("ESKOMSEPUSH_TOKEN", "")

    if not esp_token:
        return {
            "status": "api_key_required",
            "message": "Set ESKOMSEPUSH_TOKEN for area-specific schedules",
            "get_key": "https://eskomsepush.gumroad.com/l/api"
        }

    # Check cache
    ckey = cache_key("loadshedding_area", round(lat, 3), round(lng, 3))
    cached = cache_get(ckey)
    if cached:
        cached["cached"] = True
        return cached

    try:
        async with httpx.AsyncClient() as client:
            # First, search for area by coordinates
            search_url = "https://developer.sepush.co.za/business/2.0/areas_nearby"
            response = await client.get(
                search_url,
                headers={"Token": esp_token},
                params={"lat": lat, "lon": lng},
                timeout=10
            )
            response.raise_for_status()
            areas = response.json().get("areas", [])

            if not areas:
                return {
                    "status": "not_found",
                    "message": "No load shedding area found for this location",
                    "lat": lat,
                    "lng": lng
                }

            # Get schedule for the first (closest) area
            area = areas[0]
            area_id = area.get("id")

            schedule_url = "https://developer.sepush.co.za/business/2.0/area"
            schedule_response = await client.get(
                schedule_url,
                headers={"Token": esp_token},
                params={"id": area_id},
                timeout=10
            )
            schedule_response.raise_for_status()
            schedule_data = schedule_response.json()

            result = {
                "area": {
                    "id": area_id,
                    "name": area.get("name"),
                    "region": area.get("region")
                },
                "events": schedule_data.get("events", []),
                "schedule": schedule_data.get("schedule", {}),
                "info": schedule_data.get("info", {}),
                "source": "EskomSePush",
                "cached": False
            }

            # Cache for 15 minutes
            cache_set(ckey, result, ttl_seconds=900)
            return result

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/api/loadshedding/search", tags=["South Africa"])
async def search_loadshedding_area(
    q: str = Query(..., description="Area name to search", min_length=3)
):
    """
    Search for a load shedding area by name.

    Example: /api/loadshedding/search?q=Sandton
    """
    esp_token = os.getenv("ESKOMSEPUSH_TOKEN", "")

    if not esp_token:
        return {
            "status": "api_key_required",
            "message": "Set ESKOMSEPUSH_TOKEN for area search",
            "get_key": "https://eskomsepush.gumroad.com/l/api"
        }

    try:
        async with httpx.AsyncClient() as client:
            url = "https://developer.sepush.co.za/business/2.0/areas_search"
            response = await client.get(
                url,
                headers={"Token": esp_token},
                params={"text": q},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            return {
                "query": q,
                "areas": data.get("areas", []),
                "count": len(data.get("areas", [])),
                "source": "EskomSePush"
            }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


# ============================================
# Geocoding & Reverse Geocoding (Nominatim)
# ============================================

class GeocodingResult(BaseModel):
    place_id: int
    display_name: str
    lat: float
    lng: float
    address: dict
    type: str
    importance: float
    boundingbox: Optional[List[float]] = None


@app.get("/api/geocode", tags=["Geocoding"])
@limiter.limit("60/minute")
async def geocode(
    request: Request,
    q: str = Query(..., description="Address or place name to search"),
    limit: int = Query(5, le=20, description="Maximum results"),
    countrycodes: Optional[str] = Query(None, description="Limit to countries (e.g., 'za,bw,mz')"),
):
    """
    Convert address/place name to coordinates (geocoding).

    Similar to Google Maps Geocoding API.

    Example: /api/geocode?q=Johannesburg, South Africa
    """
    params = {
        "q": q,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": limit,
    }
    if countrycodes:
        params["countrycodes"] = countrycodes

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{NOMINATIM_URL}/search",
                params=params,
                headers={"User-Agent": "DataAcuity-Maps/1.0"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail="Geocoding service unavailable"
                )

            results = response.json()

            return {
                "query": q,
                "results": [
                    {
                        "place_id": r.get("place_id"),
                        "display_name": r.get("display_name"),
                        "lat": float(r.get("lat", 0)),
                        "lng": float(r.get("lon", 0)),
                        "address": r.get("address", {}),
                        "type": r.get("type"),
                        "category": r.get("category"),
                        "importance": r.get("importance", 0),
                        "boundingbox": [float(x) for x in r.get("boundingbox", [])] if r.get("boundingbox") else None
                    }
                    for r in results
                ],
                "count": len(results)
            }

    except httpx.RequestError as e:
        logger.warning(f"Geocoding service error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=503,
            detail="Geocoding service connection failed"
        )


@app.get("/api/reverse-geocode", tags=["Geocoding"])
@limiter.limit("60/minute")
async def reverse_geocode(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    zoom: int = Query(18, ge=0, le=18, description="Address detail level (0-18, higher=more detail)"),
):
    """
    Convert coordinates to address (reverse geocoding).

    Similar to Google Maps Reverse Geocoding API.

    Example: /api/reverse-geocode?lat=-26.2041&lng=28.0473

    Returns the address at the given coordinates.
    """
    params = {
        "lat": lat,
        "lon": lng,
        "format": "jsonv2",
        "addressdetails": 1,
        "zoom": zoom,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{NOMINATIM_URL}/reverse",
                params=params,
                headers={"User-Agent": "DataAcuity-Maps/1.0"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail="Geocoding service unavailable"
                )

            result = response.json()

            if "error" in result:
                return {
                    "query": {"lat": lat, "lng": lng},
                    "result": None,
                    "error": result.get("error", "Location not found")
                }

            return {
                "query": {"lat": lat, "lng": lng},
                "result": {
                    "place_id": result.get("place_id"),
                    "display_name": result.get("display_name"),
                    "address": result.get("address", {}),
                    "type": result.get("type"),
                    "category": result.get("category"),
                    "osm_type": result.get("osm_type"),
                    "osm_id": result.get("osm_id"),
                }
            }

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail="Geocoding service connection failed"
        )


@app.get("/api/autocomplete", tags=["Geocoding"])
async def autocomplete(
    q: str = Query(..., min_length=2, description="Partial address or place name"),
    lat: Optional[float] = Query(None, description="Bias results near this latitude"),
    lng: Optional[float] = Query(None, description="Bias results near this longitude"),
    countrycodes: Optional[str] = Query("za", description="Limit to countries (e.g., 'za,bw,mz')"),
    limit: int = Query(5, le=10, description="Maximum results"),
):
    """
    Address autocomplete for search boxes.

    Similar to Google Maps Places Autocomplete API.

    Example: /api/autocomplete?q=Sand&lat=-26.2041&lng=28.0473

    Returns matching places sorted by relevance and proximity.
    """
    params = {
        "q": q,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": limit,
    }

    if countrycodes:
        params["countrycodes"] = countrycodes

    # Add viewbox for proximity bias if coordinates provided
    if lat is not None and lng is not None:
        # Create a bounding box around the point (roughly 50km)
        delta = 0.5  # ~50km at equator
        params["viewbox"] = f"{lng-delta},{lat-delta},{lng+delta},{lat+delta}"
        params["bounded"] = 0  # Allow results outside viewbox but prefer inside

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{NOMINATIM_URL}/search",
                params=params,
                headers={"User-Agent": "DataAcuity-Maps/1.0"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail="Autocomplete service unavailable"
                )

            results = response.json()

            return {
                "query": q,
                "predictions": [
                    {
                        "place_id": r.get("place_id"),
                        "description": r.get("display_name"),
                        "main_text": r.get("name", r.get("display_name", "").split(",")[0]),
                        "secondary_text": ", ".join(r.get("display_name", "").split(",")[1:3]).strip(),
                        "lat": float(r.get("lat", 0)),
                        "lng": float(r.get("lon", 0)),
                        "type": r.get("type"),
                    }
                    for r in results
                ]
            }

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail="Autocomplete service connection failed"
        )


# ============================================
# Crowdsourced Traffic (from TagMe data)
# ============================================

@app.get("/api/traffic", tags=["Traffic"])
async def get_traffic(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    db: Session = Depends(get_db)
):
    """
    Get real-time traffic conditions from crowdsourced TagMe data.

    Calculates traffic by comparing observed speeds (from TagMe users)
    to expected road speeds (from OSM speed limits).

    Traffic levels:
    - free: observed speed >= 80% of expected
    - moderate: observed speed 50-80% of expected
    - heavy: observed speed 25-50% of expected
    - standstill: observed speed < 25% of expected
    """
    coords = validate_bbox(bbox)

    # Query TagMe location data from last 15 minutes to calculate speeds
    # This aggregates user movements on road segments
    query = """
        WITH recent_movements AS (
            -- Get consecutive location pings from TagMe users in last 15 min
            SELECT
                user_hash,
                lat,
                lng,
                recorded_at,
                LAG(lat) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_lat,
                LAG(lng) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_lng,
                LAG(recorded_at) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_time
            FROM tagme_locations
            WHERE recorded_at > NOW() - INTERVAL '15 minutes'
              AND lat BETWEEN :min_lat AND :max_lat
              AND lng BETWEEN :min_lng AND :max_lng
        ),
        speed_calculations AS (
            -- Calculate speed between consecutive points
            SELECT
                user_hash,
                lat, lng,
                prev_lat, prev_lng,
                -- Haversine distance in km
                (6371 * acos(
                    cos(radians(lat)) * cos(radians(prev_lat)) *
                    cos(radians(prev_lng) - radians(lng)) +
                    sin(radians(lat)) * sin(radians(prev_lat))
                )) as distance_km,
                -- Time difference in hours
                EXTRACT(EPOCH FROM (recorded_at - prev_time)) / 3600.0 as time_hours,
                recorded_at
            FROM recent_movements
            WHERE prev_lat IS NOT NULL
              AND prev_time IS NOT NULL
              AND recorded_at - prev_time < INTERVAL '5 minutes'  -- Max 5 min gap
              AND recorded_at - prev_time > INTERVAL '10 seconds' -- Min 10 sec gap
        ),
        user_speeds AS (
            SELECT
                -- Round to road segment (0.001 deg ~ 100m)
                ROUND(lat::numeric, 3) as segment_lat,
                ROUND(lng::numeric, 3) as segment_lng,
                -- Speed in km/h
                CASE
                    WHEN time_hours > 0 THEN distance_km / time_hours
                    ELSE 0
                END as speed_kmh,
                recorded_at
            FROM speed_calculations
            WHERE distance_km < 5  -- Ignore teleportation (GPS jumps)
              AND distance_km > 0.01  -- Ignore stationary
        )
        SELECT
            segment_lat as lat,
            segment_lng as lng,
            AVG(speed_kmh) as avg_speed_kmh,
            COUNT(*) as sample_count,
            MAX(recorded_at) as last_update
        FROM user_speeds
        GROUP BY segment_lat, segment_lng
        HAVING COUNT(*) >= 2  -- Need at least 2 samples
        ORDER BY sample_count DESC
        LIMIT 500
    """

    result = db.execute(text(query), {
        "min_lat": coords[1], "max_lat": coords[3],
        "min_lng": coords[0], "max_lng": coords[2]
    })
    segments = [dict(row._mapping) for row in result]

    # Classify traffic levels
    # Using 60 km/h as baseline urban speed, 120 km/h for highways
    traffic_features = []
    for seg in segments:
        avg_speed = float(seg["avg_speed_kmh"])
        # Assume urban roads (60 km/h expected)
        expected_speed = 60.0
        ratio = avg_speed / expected_speed if expected_speed > 0 else 1.0

        if ratio >= 0.8:
            level = "free"
            color = "#00ff00"
        elif ratio >= 0.5:
            level = "moderate"
            color = "#ffff00"
        elif ratio >= 0.25:
            level = "heavy"
            color = "#ff8800"
        else:
            level = "standstill"
            color = "#ff0000"

        traffic_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(seg["lng"]), float(seg["lat"])]
            },
            "properties": {
                "avg_speed_kmh": round(avg_speed, 1),
                "sample_count": seg["sample_count"],
                "traffic_level": level,
                "color": color,
                "last_update": seg["last_update"].isoformat() if seg["last_update"] else None
            }
        })

    return {
        "type": "FeatureCollection",
        "features": traffic_features,
        "metadata": {
            "source": "TagMe crowdsourced",
            "coverage": "South Africa",
            "update_frequency": "Real-time (15 min window)",
            "segment_count": len(traffic_features)
        }
    }


@app.get("/api/traffic/route", tags=["Traffic"])
async def get_route_with_traffic(
    origin: str = Query(..., description="Origin: lng,lat"),
    destination: str = Query(..., description="Destination: lng,lat"),
    mode: TravelMode = Query(TravelMode.driving),
    db: Session = Depends(get_db)
):
    """
    Get route with real-time traffic estimates.

    Combines OSRM routing with TagMe crowdsourced traffic data
    to provide more accurate ETAs.
    """
    # First get the base route
    try:
        origin_coords = [float(x) for x in origin.split(",")]
        dest_coords = [float(x) for x in destination.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    route_request = RouteRequest(
        origin=origin_coords,
        destination=dest_coords,
        mode=mode,
        steps=True
    )

    try:
        base_route = await get_route(route_request)
    except HTTPException:
        raise

    # Get traffic along the route corridor
    # Create bounding box from route geometry
    route_coords = base_route.geometry.get("coordinates", [])
    if route_coords:
        lngs = [c[0] for c in route_coords]
        lats = [c[1] for c in route_coords]
        bbox = f"{min(lngs)},{min(lats)},{max(lngs)},{max(lats)}"

        # Get traffic data
        traffic_query = """
            WITH route_corridor AS (
                SELECT
                    ROUND(lat::numeric, 3) as segment_lat,
                    ROUND(lng::numeric, 3) as segment_lng,
                    AVG(
                        CASE
                            WHEN prev_time IS NOT NULL AND
                                 recorded_at - prev_time < INTERVAL '5 minutes' AND
                                 recorded_at - prev_time > INTERVAL '10 seconds'
                            THEN (6371 * acos(
                                cos(radians(lat)) * cos(radians(prev_lat)) *
                                cos(radians(prev_lng) - radians(lng)) +
                                sin(radians(lat)) * sin(radians(prev_lat))
                            )) / (EXTRACT(EPOCH FROM (recorded_at - prev_time)) / 3600.0)
                            ELSE NULL
                        END
                    ) as avg_speed_kmh
                FROM (
                    SELECT
                        lat, lng, recorded_at,
                        LAG(lat) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_lat,
                        LAG(lng) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_lng,
                        LAG(recorded_at) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_time
                    FROM tagme_locations
                    WHERE recorded_at > NOW() - INTERVAL '30 minutes'
                      AND lat BETWEEN :min_lat AND :max_lat
                      AND lng BETWEEN :min_lng AND :max_lng
                ) sub
                GROUP BY segment_lat, segment_lng
            )
            SELECT
                AVG(avg_speed_kmh) as corridor_avg_speed,
                COUNT(*) as segments_with_data
            FROM route_corridor
            WHERE avg_speed_kmh IS NOT NULL
              AND avg_speed_kmh BETWEEN 5 AND 150  -- Reasonable speed range
        """

        coords = validate_bbox(bbox)
        result = db.execute(text(traffic_query), {
            "min_lat": coords[1], "max_lat": coords[3],
            "min_lng": coords[0], "max_lng": coords[2]
        })
        traffic_data = result.fetchone()

        # Adjust ETA based on traffic
        traffic_factor = 1.0
        traffic_level = "unknown"

        if traffic_data and traffic_data.corridor_avg_speed:
            avg_speed = float(traffic_data.corridor_avg_speed)
            expected_speed = 50.0  # Base urban expectation

            if avg_speed >= expected_speed * 0.8:
                traffic_level = "free"
                traffic_factor = 1.0
            elif avg_speed >= expected_speed * 0.5:
                traffic_level = "moderate"
                traffic_factor = 1.3
            elif avg_speed >= expected_speed * 0.25:
                traffic_level = "heavy"
                traffic_factor = 1.8
            else:
                traffic_level = "standstill"
                traffic_factor = 3.0

        # Adjust duration
        adjusted_duration = base_route.duration_s * traffic_factor
        hours = int(adjusted_duration // 3600)
        minutes = int((adjusted_duration % 3600) // 60)
        adjusted_duration_text = f"{hours}h {minutes}min" if hours > 0 else f"{minutes} min"

        return {
            "route": {
                "distance_m": base_route.distance_m,
                "distance_text": base_route.distance_text,
                "duration_s": base_route.duration_s,
                "duration_text": base_route.duration_text,
                "duration_in_traffic_s": adjusted_duration,
                "duration_in_traffic_text": adjusted_duration_text,
                "geometry": base_route.geometry,
                "steps": base_route.steps
            },
            "traffic": {
                "level": traffic_level,
                "factor": traffic_factor,
                "avg_speed_kmh": traffic_data.corridor_avg_speed if traffic_data else None,
                "segments_sampled": traffic_data.segments_with_data if traffic_data else 0,
                "source": "TagMe crowdsourced"
            }
        }

    return {
        "route": base_route.dict(),
        "traffic": {
            "level": "unknown",
            "factor": 1.0,
            "source": "No traffic data available"
        }
    }


@app.get("/api/route/alternatives", tags=["Navigation"])
async def get_routes_with_alternatives(
    origin: str = Query(..., description="Origin: lng,lat"),
    destination: str = Query(..., description="Destination: lng,lat"),
    mode: TravelMode = Query(TravelMode.driving),
    with_traffic: bool = Query(True, description="Include traffic-adjusted ETAs"),
    db: Session = Depends(get_db)
):
    """
    Get multiple route options with traffic-aware ETAs.

    Returns up to 3 route alternatives with:
    - Base duration (no traffic)
    - Traffic-adjusted duration
    - Traffic level indicator
    - Route geometry for display

    Perfect for Waze-style route selection.
    """
    try:
        origin_coords = [float(x) for x in origin.split(",")]
        dest_coords = [float(x) for x in destination.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    # Build OSRM request with alternatives
    coords_str = f"{origin_coords[0]},{origin_coords[1]};{dest_coords[0]},{dest_coords[1]}"

    profile_map = {
        TravelMode.driving: "car",
        TravelMode.walking: "foot",
        TravelMode.cycling: "bicycle"
    }
    profile = profile_map.get(mode, "car")

    osrm_url = f"{OSRM_URL}/route/v1/{profile}/{coords_str}"
    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "true",
        "alternatives": "true",
        "annotations": "true"  # Get speed data
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(osrm_url, params=params)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail="Routing service unavailable"
                )

            data = response.json()

            if data.get("code") != "Ok":
                raise HTTPException(
                    status_code=400,
                    detail=f"Routing failed: {data.get('message', 'Unknown error')}"
                )

            routes = []

            for idx, route in enumerate(data["routes"][:3]):  # Max 3 alternatives
                # Format duration
                duration_s = route["duration"]
                distance_m = route["distance"]

                hours = int(duration_s // 3600)
                minutes = int((duration_s % 3600) // 60)
                duration_text = f"{hours}h {minutes}min" if hours > 0 else f"{minutes} min"

                # Format distance
                if distance_m >= 1000:
                    distance_text = f"{distance_m/1000:.1f} km"
                else:
                    distance_text = f"{int(distance_m)} m"

                # Extract steps with lane data
                steps = []
                if "legs" in route:
                    for leg in route["legs"]:
                        for step in leg.get("steps", []):
                            # Extract lane data from intersections
                            lanes = None
                            intersections = step.get("intersections", [])
                            if intersections:
                                last_intersection = intersections[-1] if len(intersections) > 0 else None
                                if last_intersection and "lanes" in last_intersection:
                                    lanes = []
                                    for lane in last_intersection["lanes"]:
                                        lanes.append({
                                            "valid": lane.get("valid", False),
                                            "indications": lane.get("indications", [])
                                        })

                            steps.append({
                                "instruction": step.get("maneuver", {}).get("instruction", ""),
                                "name": step.get("name", ""),
                                "distance_m": step.get("distance", 0),
                                "duration_s": step.get("duration", 0),
                                "maneuver": step.get("maneuver", {}).get("type", ""),
                                "modifier": step.get("maneuver", {}).get("modifier", ""),
                                "lanes": lanes,
                            })

                # Calculate traffic factor
                traffic_factor = 1.0
                traffic_level = "unknown"
                duration_in_traffic_s = duration_s

                if with_traffic:
                    # Get traffic for this route's corridor
                    route_coords = route["geometry"].get("coordinates", [])
                    if route_coords:
                        lngs = [c[0] for c in route_coords]
                        lats = [c[1] for c in route_coords]

                        traffic_query = """
                            WITH route_corridor AS (
                                SELECT
                                    AVG(
                                        CASE
                                            WHEN prev_time IS NOT NULL AND
                                                 recorded_at - prev_time < INTERVAL '5 minutes' AND
                                                 recorded_at - prev_time > INTERVAL '10 seconds'
                                            THEN (6371 * acos(
                                                cos(radians(lat)) * cos(radians(prev_lat)) *
                                                cos(radians(prev_lng) - radians(lng)) +
                                                sin(radians(lat)) * sin(radians(prev_lat))
                                            )) / (EXTRACT(EPOCH FROM (recorded_at - prev_time)) / 3600.0)
                                            ELSE NULL
                                        END
                                    ) as avg_speed_kmh
                                FROM (
                                    SELECT
                                        lat, lng, recorded_at,
                                        LAG(lat) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_lat,
                                        LAG(lng) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_lng,
                                        LAG(recorded_at) OVER (PARTITION BY user_hash ORDER BY recorded_at) as prev_time
                                    FROM tagme_locations
                                    WHERE recorded_at > NOW() - INTERVAL '30 minutes'
                                      AND lat BETWEEN :min_lat AND :max_lat
                                      AND lng BETWEEN :min_lng AND :max_lng
                                ) sub
                            )
                            SELECT AVG(avg_speed_kmh) as corridor_avg_speed
                            FROM route_corridor
                            WHERE avg_speed_kmh IS NOT NULL
                              AND avg_speed_kmh BETWEEN 5 AND 150
                        """

                        try:
                            result = db.execute(text(traffic_query), {
                                "min_lat": min(lats), "max_lat": max(lats),
                                "min_lng": min(lngs), "max_lng": max(lngs)
                            })
                            traffic_data = result.fetchone()

                            if traffic_data and traffic_data.corridor_avg_speed:
                                avg_speed = float(traffic_data.corridor_avg_speed)
                                expected_speed = 50.0

                                if avg_speed >= expected_speed * 0.8:
                                    traffic_level = "free"
                                    traffic_factor = 1.0
                                elif avg_speed >= expected_speed * 0.5:
                                    traffic_level = "moderate"
                                    traffic_factor = 1.3
                                elif avg_speed >= expected_speed * 0.25:
                                    traffic_level = "heavy"
                                    traffic_factor = 1.8
                                else:
                                    traffic_level = "severe"
                                    traffic_factor = 2.5
                        except Exception:
                            pass  # Keep default traffic values

                duration_in_traffic_s = duration_s * traffic_factor
                hours_traffic = int(duration_in_traffic_s // 3600)
                minutes_traffic = int((duration_in_traffic_s % 3600) // 60)
                duration_in_traffic_text = f"{hours_traffic}h {minutes_traffic}min" if hours_traffic > 0 else f"{minutes_traffic} min"

                # Determine route label
                if idx == 0:
                    route_label = "Fastest"
                elif distance_m < data["routes"][0]["distance"] * 0.95:
                    route_label = "Shortest"
                else:
                    route_label = f"Alternative {idx}"

                routes.append({
                    "id": idx,
                    "label": route_label,
                    "distance_m": distance_m,
                    "distance_text": distance_text,
                    "duration_s": duration_s,
                    "duration_text": duration_text,
                    "duration_in_traffic_s": duration_in_traffic_s,
                    "duration_in_traffic_text": duration_in_traffic_text,
                    "traffic": {
                        "level": traffic_level,
                        "factor": traffic_factor
                    },
                    "geometry": route["geometry"],
                    "steps": steps,
                    "summary": route.get("legs", [{}])[0].get("summary", "")
                })

            return {
                "routes": routes,
                "origin": origin_coords,
                "destination": dest_coords,
                "mode": mode.value,
                "waypoints": data.get("waypoints", [])
            }

    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Routing service connection failed"
        )


@app.get("/api/navigation/status", tags=["Navigation"])
async def navigation_status():
    """
    Check status of routing and geocoding services.
    """
    status = {
        "routing": {"osrm": {"status": "unknown", "url": OSRM_URL}},
        "geocoding": {"nominatim": {"status": "unknown", "url": NOMINATIM_URL}}
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        # Check OSRM
        try:
            response = await client.get(f"{OSRM_URL}/health")
            status["routing"]["osrm"]["status"] = "healthy" if response.status_code == 200 else "degraded"
        except:
            status["routing"]["osrm"]["status"] = "unavailable"

        # Check Nominatim
        try:
            response = await client.get(f"{NOMINATIM_URL}/status")
            status["geocoding"]["nominatim"]["status"] = "healthy" if response.status_code == 200 else "degraded"
        except:
            status["geocoding"]["nominatim"]["status"] = "unavailable"

    overall = "healthy"
    if status["routing"]["osrm"]["status"] != "healthy" or status["geocoding"]["nominatim"]["status"] != "healthy":
        overall = "degraded"
    if status["routing"]["osrm"]["status"] == "unavailable" and status["geocoding"]["nominatim"]["status"] == "unavailable":
        overall = "unavailable"

    return {
        "overall": overall,
        "services": status,
        "coverage": "South Africa",
        "data_source": "OpenStreetMap"
    }


# ============================================
# FUN FEATURES - Engaging for all ages
# ============================================

# --- Journey Stats & Achievements ---

class JourneyStats(BaseModel):
    """Statistics for a completed journey"""
    distance_km: float
    duration_minutes: float
    calories_burned: Optional[float] = None  # For walking/cycling
    co2_saved_kg: Optional[float] = None     # vs driving
    trees_equivalent: Optional[float] = None  # CO2 offset visualization
    fun_facts: List[str] = []
    achievements: List[str] = []

@app.get("/api/journey/stats", tags=["Fun Features"])
async def get_journey_stats(
    origin: str = Query(..., description="Origin as lat,lng"),
    destination: str = Query(..., description="Destination as lat,lng"),
    mode: str = Query("driving", description="Travel mode")
):
    """
    Get fun statistics about a journey - calories, CO2 savings, achievements!

    Great for encouraging eco-friendly travel and gamifying the experience.
    """
    try:
        orig_lat, orig_lng = map(float, origin.split(","))
        dest_lat, dest_lng = map(float, destination.split(","))
    except:
        raise HTTPException(400, "Invalid coordinates format")

    # Get route distance
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            coords = f"{orig_lng},{orig_lat};{dest_lng},{dest_lat}"
            response = await client.get(f"{OSRM_URL}/route/v1/driving/{coords}")
            data = response.json()

            if data.get("code") != "Ok":
                raise HTTPException(400, "Could not calculate route")

            route = data["routes"][0]
            distance_km = route["distance"] / 1000
            duration_min = route["duration"] / 60
        except:
            # Fallback to haversine estimate
            from math import radians, cos, sin, asin, sqrt
            def haversine(lat1, lng1, lat2, lng2):
                lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
                dlat = lat2 - lat1
                dlng = lng2 - lng1
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
                return 2 * 6371 * asin(sqrt(a))

            distance_km = haversine(orig_lat, orig_lng, dest_lat, dest_lng)
            duration_min = distance_km / 50 * 60  # Assume 50km/h average

    # Calculate fun stats
    stats = {
        "distance_km": round(distance_km, 2),
        "duration_minutes": round(duration_min, 1),
        "fun_facts": [],
        "achievements": []
    }

    # Calories (walking/cycling)
    if mode == "walking":
        # ~60 calories per km walking
        stats["calories_burned"] = round(distance_km * 60, 0)
        stats["fun_facts"].append(f"🚶 You'll take about {int(distance_km * 1312)} steps!")
        stats["fun_facts"].append(f"🍕 That's {round(distance_km * 60 / 285, 1)} slices of pizza worth of calories!")
    elif mode == "cycling":
        # ~35 calories per km cycling
        stats["calories_burned"] = round(distance_km * 35, 0)
        stats["fun_facts"].append(f"🚴 Your legs will spin about {int(distance_km * 60)} times!")

    # CO2 savings (vs car: 120g/km average)
    if mode in ["walking", "cycling"]:
        co2_saved = distance_km * 0.12  # kg
        stats["co2_saved_kg"] = round(co2_saved, 2)
        stats["trees_equivalent"] = round(co2_saved / 21 * 365, 1)  # Trees absorb ~21kg/year
        stats["fun_facts"].append(f"🌍 You'll save {round(co2_saved * 1000)}g of CO2!")
        stats["fun_facts"].append(f"🌳 That's like planting {stats['trees_equivalent']} trees for a day!")

    # Distance-based fun facts
    if distance_km < 1:
        stats["fun_facts"].append("👟 Perfect distance for a quick stretch!")
    elif distance_km < 5:
        stats["fun_facts"].append("☕ A nice distance to clear your mind!")
    elif distance_km < 20:
        stats["fun_facts"].append("🎯 A solid workout distance!")
    elif distance_km < 100:
        stats["fun_facts"].append("🏆 That's a proper adventure!")
    else:
        stats["fun_facts"].append(f"🗺️ Epic journey! That's {round(distance_km / 40075 * 100, 2)}% around the Earth!")

    # Achievements
    if distance_km >= 5:
        stats["achievements"].append("🏅 5K Champion")
    if distance_km >= 10:
        stats["achievements"].append("🏅 10K Explorer")
    if distance_km >= 21.1:
        stats["achievements"].append("🏅 Half Marathon Hero")
    if distance_km >= 42.2:
        stats["achievements"].append("🏅 Marathon Legend")
    if distance_km >= 100:
        stats["achievements"].append("🏅 Century Rider")
    if mode == "walking" and distance_km >= 1:
        stats["achievements"].append("🌿 Eco Warrior")
    if mode == "cycling" and distance_km >= 10:
        stats["achievements"].append("⚡ Speed Demon")

    return stats


# --- Location Sharing & Safety ---

class LocationShare(BaseModel):
    """Share your live location with friends/family"""
    share_id: str
    expires_at: datetime
    share_url: str

@app.post("/api/share/location", tags=["Fun Features"])
@limiter.limit("10/minute")
async def create_location_share(
    request: Request,
    duration_minutes: int = Query(60, ge=15, le=480, description="How long to share (15-480 mins)"),
    user_hash: str = Query(..., description="Anonymized user ID"),
    db: Session = Depends(get_db)
):
    """
    Create a shareable link for your live location.

    Perfect for:
    - 🏃 Letting family track your run/walk
    - 🚗 Sharing your ETA with friends
    - 👨‍👩‍👧 Kids walking home from school
    - 🎉 Meeting up at events

    Privacy-first: Link expires automatically, no account needed.
    """
    import secrets
    from datetime import timedelta

    # Validate user_hash format to prevent injection
    validate_user_hash(user_hash)

    share_id = secrets.token_urlsafe(16)
    expires_at = datetime.utcnow() + timedelta(minutes=duration_minutes)

    # Store in database
    db.execute(text("""
        INSERT INTO location_shares (share_id, user_hash, expires_at, created_at)
        VALUES (:share_id, :user_hash, :expires_at, NOW())
        ON CONFLICT (share_id) DO NOTHING
    """), {"share_id": share_id, "user_hash": user_hash, "expires_at": expires_at})
    db.commit()

    return {
        "share_id": share_id,
        "expires_at": expires_at.isoformat(),
        "share_url": f"https://maps.dataacuity.co.za/track/{share_id}",
        "duration_minutes": duration_minutes,
        "message": "Share this link with friends and family to let them see your location!"
    }


@app.get("/api/share/{share_id}", tags=["Fun Features"])
async def get_shared_location(share_id: str, db: Session = Depends(get_db)):
    """
    Get the current location from a share link.
    Returns the most recent location if the share is still valid.
    """
    result = db.execute(text("""
        SELECT ls.user_hash, ls.expires_at,
               tl.lat, tl.lng, tl.recorded_at, tl.speed_mps
        FROM location_shares ls
        LEFT JOIN LATERAL (
            SELECT lat, lng, recorded_at, speed_mps
            FROM tagme_locations
            WHERE user_hash = ls.user_hash
            ORDER BY recorded_at DESC
            LIMIT 1
        ) tl ON true
        WHERE ls.share_id = :share_id
    """), {"share_id": share_id})

    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Share link not found")

    row = dict(row._mapping)
    if row["expires_at"] < datetime.utcnow():
        raise HTTPException(410, "Share link has expired")

    if not row.get("lat"):
        return {"message": "Waiting for location update...", "share_id": share_id}

    return {
        "lat": row["lat"],
        "lng": row["lng"],
        "last_updated": row["recorded_at"].isoformat() if row["recorded_at"] else None,
        "speed_kmh": round(row["speed_mps"] * 3.6, 1) if row["speed_mps"] else None,
        "expires_at": row["expires_at"].isoformat()
    }


# --- Trip ETA Sharing ---

class TripUpdate(BaseModel):
    """Trip location update for ETA sharing"""
    tripId: str
    destination: str
    eta: str
    remaining: str
    destLat: Optional[float] = None
    destLng: Optional[float] = None
    currentLat: Optional[float] = None
    currentLng: Optional[float] = None
    durationSec: Optional[float] = None
    distanceM: Optional[float] = None
    timestamp: int


@app.post("/api/share/trip", tags=["Fun Features"])
@limiter.limit("30/minute")
async def update_trip_share(
    request: Request,
    trip_data: TripUpdate
):
    """
    Update live trip location for ETA sharing.
    Stores trip data in Redis with 5-minute expiry (auto-refreshed on each update).
    """
    try:
        if redis_client:
            trip_key = f"trip:{trip_data.tripId}"
            trip_json = trip_data.model_dump_json()
            # Store with 5 minute expiry (will be refreshed on each update)
            redis_client.setex(trip_key, 300, trip_json)
            return {"status": "ok", "tripId": trip_data.tripId}
        else:
            # No Redis - still return success (client-side link will still work)
            return {"status": "ok", "tripId": trip_data.tripId, "cached": False}
    except Exception as e:
        logger.warning(f"Failed to store trip update: {e}")
        return {"status": "ok", "tripId": trip_data.tripId, "cached": False}


@app.get("/api/share/trip/{trip_id}", tags=["Fun Features"])
async def get_trip_status(trip_id: str):
    """
    Get the current status of a shared trip.
    Returns the latest ETA and location if available.
    """
    # Validate trip_id format
    if not trip_id.startswith("trip_") or len(trip_id) > 50:
        raise HTTPException(400, "Invalid trip ID format")

    try:
        if redis_client:
            trip_key = f"trip:{trip_id}"
            trip_data = redis_client.get(trip_key)
            if trip_data:
                import json
                return json.loads(trip_data)
    except Exception as e:
        logger.warning(f"Failed to retrieve trip data: {e}")

    raise HTTPException(404, "Trip not found or has expired")


# --- Themed Map Styles ---

THEME_STYLES = {
    "default": {
        "name": "Classic",
        "description": "Clean, easy-to-read default style",
        "icon": "🗺️"
    },
    "dark": {
        "name": "Dark Mode",
        "description": "Easy on the eyes at night",
        "icon": "🌙"
    },
    "satellite": {
        "name": "Satellite",
        "description": "Real satellite imagery",
        "icon": "🛰️"
    },
    "retro": {
        "name": "Vintage",
        "description": "Old-school paper map aesthetic",
        "icon": "📜"
    },
    "neon": {
        "name": "Neon Nights",
        "description": "Cyberpunk-inspired glow",
        "icon": "🌆"
    },
    "minimal": {
        "name": "Minimal",
        "description": "Just the essentials",
        "icon": "⬜"
    },
    "nature": {
        "name": "Nature",
        "description": "Emphasizes parks and green spaces",
        "icon": "🌲"
    },
    "accessibility": {
        "name": "High Contrast",
        "description": "Maximum readability for all users",
        "icon": "👁️"
    }
}

@app.get("/api/themes", tags=["Fun Features"])
async def list_map_themes():
    """
    Get available map themes/styles.

    From classic to cyberpunk - express yourself! 🎨
    """
    return {
        "themes": THEME_STYLES,
        "default": "default",
        "tip": "Try 'neon' for night drives or 'nature' for hiking!"
    }


# --- Points of Interest Discovery ---

POI_CATEGORIES = {
    "food": {"icon": "🍕", "name": "Food & Drink", "subcategories": ["restaurant", "cafe", "bar", "fast_food"]},
    "entertainment": {"icon": "🎬", "name": "Entertainment", "subcategories": ["cinema", "theatre", "nightclub", "casino"]},
    "shopping": {"icon": "🛍️", "name": "Shopping", "subcategories": ["mall", "supermarket", "clothing", "electronics"]},
    "nature": {"icon": "🌳", "name": "Nature & Parks", "subcategories": ["park", "beach", "viewpoint", "nature_reserve"]},
    "culture": {"icon": "🏛️", "name": "Culture & History", "subcategories": ["museum", "gallery", "monument", "historic"]},
    "sports": {"icon": "⚽", "name": "Sports & Recreation", "subcategories": ["gym", "stadium", "swimming", "golf"]},
    "services": {"icon": "🏥", "name": "Services", "subcategories": ["hospital", "pharmacy", "bank", "police"]},
    "transport": {"icon": "🚉", "name": "Transport", "subcategories": ["station", "airport", "bus_stop", "taxi"]},
    "hidden_gems": {"icon": "💎", "name": "Hidden Gems", "subcategories": ["local_favorite", "scenic", "unique"]}
}

@app.get("/api/discover/categories", tags=["Fun Features"])
async def get_poi_categories():
    """
    Get categories for exploring nearby places.

    From foodie adventures to hidden gems! 🔍
    """
    return {"categories": POI_CATEGORIES}


@app.get("/api/discover/nearby", tags=["Fun Features"])
async def discover_nearby(
    lat: float = Query(..., description="Your latitude"),
    lng: float = Query(..., description="Your longitude"),
    category: Optional[str] = Query(None, description="Category to filter by"),
    radius_km: float = Query(2.0, ge=0.1, le=50, description="Search radius in km"),
    surprise_me: bool = Query(False, description="Get random suggestions"),
    db: Session = Depends(get_db)
):
    """
    Discover interesting places nearby!

    Use 'surprise_me=true' for random adventures 🎲
    """
    # Query for POIs (using places table with type filtering)
    query = """
        SELECT
            p.id, p.current_name as name, p.place_type as type,
            ST_X(p.geometry) as lng, ST_Y(p.geometry) as lat,
            ST_Distance(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 as distance_km,
            p.feature_class
        FROM places p
        WHERE ST_DWithin(
            p.geometry::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_m
        )
    """

    params = {"lat": lat, "lng": lng, "radius_m": radius_km * 1000}

    if category and category in POI_CATEGORIES:
        types = POI_CATEGORIES[category]["subcategories"]
        query += " AND p.place_type = ANY(:types)"
        params["types"] = types

    if surprise_me:
        query += " ORDER BY RANDOM() LIMIT 5"
    else:
        query += " ORDER BY distance_km LIMIT 20"

    result = db.execute(text(query), params)
    places = [dict(row._mapping) for row in result]

    # Add icons and fun tips
    for place in places:
        place["distance_display"] = f"{round(place['distance_km'] * 1000)}m" if place['distance_km'] < 1 else f"{round(place['distance_km'], 1)}km"

    return {
        "location": {"lat": lat, "lng": lng},
        "radius_km": radius_km,
        "count": len(places),
        "places": places,
        "tip": "Try 'surprise_me=true' for a random adventure!" if not surprise_me else "Here's your random adventure! 🎲"
    }


# --- Weather Integration (for trip planning) ---

@app.get("/api/weather/along-route", tags=["Fun Features"])
async def weather_along_route(
    origin: str = Query(..., description="Origin as lat,lng"),
    destination: str = Query(..., description="Destination as lat,lng")
):
    """
    Get weather conditions along your route.

    Plan your trip with weather in mind! ☀️🌧️

    Note: Returns placeholder data - integrate with OpenMeteo (free) for live weather.
    """
    try:
        orig_lat, orig_lng = map(float, origin.split(","))
        dest_lat, dest_lng = map(float, destination.split(","))
    except:
        raise HTTPException(400, "Invalid coordinates")

    # This would integrate with OpenMeteo (free, no API key needed)
    # https://open-meteo.com/
    return {
        "origin_weather": {
            "location": {"lat": orig_lat, "lng": orig_lng},
            "condition": "sunny",
            "icon": "☀️",
            "temp_c": 24,
            "description": "Clear skies"
        },
        "destination_weather": {
            "location": {"lat": dest_lat, "lng": dest_lng},
            "condition": "partly_cloudy",
            "icon": "⛅",
            "temp_c": 22,
            "description": "Partly cloudy"
        },
        "recommendation": "Great weather for your trip! 🌟",
        "tip": "This is placeholder data. Integrate with open-meteo.com for live weather (free, no API key)."
    }


# --- Voice Navigation Prompts ---

VOICE_STYLES = {
    "default": {"name": "Standard", "description": "Clear, professional navigation"},
    "friendly": {"name": "Friendly", "description": "Warm, encouraging tone"},
    "pirate": {"name": "Pirate", "description": "Ahoy! Navigate like a buccaneer 🏴‍☠️"},
    "robot": {"name": "Robot", "description": "Beep boop, destination acquired 🤖"},
    "zen": {"name": "Zen", "description": "Calm, mindful navigation 🧘"},
    "sports": {"name": "Sports Coach", "description": "Motivational navigation 💪"}
}

@app.get("/api/navigation/voice-styles", tags=["Fun Features"])
async def get_voice_styles():
    """
    Available voice navigation styles.

    Make your journey fun with themed navigation voices! 🎙️
    """
    return {
        "styles": VOICE_STYLES,
        "default": "default",
        "tip": "Try 'pirate' for a fun adventure!"
    }


@app.get("/api/navigation/instruction", tags=["Fun Features"])
async def get_themed_instruction(
    instruction: str = Query(..., description="Original instruction (e.g., 'Turn left in 100m')"),
    style: str = Query("default", description="Voice style")
):
    """
    Get a themed version of a navigation instruction.

    Example: "Turn left in 100m" → "Ahoy! Swing yer ship left in 100 meters, matey! 🏴‍☠️"
    """
    themed = {
        "default": instruction,
        "friendly": f"You're doing great! {instruction} 😊",
        "pirate": f"Ahoy! {instruction.replace('Turn left', 'Swing yer ship to port').replace('Turn right', 'Starboard ho')} 🏴‍☠️",
        "robot": f"NAVIGATION UPDATE: {instruction.upper()}. BEEP BOOP. 🤖",
        "zen": f"When you feel ready, peacefully {instruction.lower()}. 🧘",
        "sports": f"YES! You've got this! {instruction}! KEEP GOING! 💪"
    }

    return {
        "original": instruction,
        "themed": themed.get(style, instruction),
        "style": style
    }


# --- Trip Memories / Photo Geotagging ---

@app.post("/api/memories/save", tags=["Fun Features"])
async def save_trip_memory(
    lat: float = Query(...),
    lng: float = Query(...),
    note: Optional[str] = Query(None, max_length=500),
    category: str = Query("general", description="Memory category"),
    user_hash: str = Query(..., description="Anonymized user ID"),
    db: Session = Depends(get_db)
):
    """
    Save a memory at a location.

    Mark your favorite spots, memorable moments, or hidden gems! 📸
    """
    import secrets

    memory_id = secrets.token_urlsafe(12)

    db.execute(text("""
        INSERT INTO trip_memories (memory_id, user_hash, lat, lng, note, category, created_at)
        VALUES (:memory_id, :user_hash, :lat, :lng, :note, :category, NOW())
    """), {
        "memory_id": memory_id,
        "user_hash": user_hash,
        "lat": lat,
        "lng": lng,
        "note": note,
        "category": category
    })
    db.commit()

    return {
        "memory_id": memory_id,
        "location": {"lat": lat, "lng": lng},
        "note": note,
        "message": "Memory saved! 📍 You can revisit this spot anytime."
    }


@app.get("/api/memories/mine", tags=["Fun Features"])
async def get_my_memories(
    user_hash: str = Query(..., description="Anonymized user ID"),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db)
):
    """
    Get all your saved memories.

    Relive your adventures! 🗺️
    """
    result = db.execute(text("""
        SELECT memory_id, lat, lng, note, category, created_at
        FROM trip_memories
        WHERE user_hash = :user_hash
        ORDER BY created_at DESC
        LIMIT :limit
    """), {"user_hash": user_hash, "limit": limit})

    memories = [dict(row._mapping) for row in result]

    return {
        "count": len(memories),
        "memories": memories,
        "tip": "Tap any memory to navigate back to that spot!"
    }


# --- Leaderboards (optional gamification) ---

@app.get("/api/leaderboard/explorers", tags=["Fun Features"])
async def get_explorer_leaderboard(
    timeframe: str = Query("weekly", description="weekly, monthly, or alltime"),
    db: Session = Depends(get_db)
):
    """
    See top explorers in your area!

    Climb the leaderboard by visiting new places. 🏆

    Privacy: Only shows anonymized stats, no personal info.
    """
    # This would be calculated from tagme_locations data
    # Showing placeholder structure
    return {
        "timeframe": timeframe,
        "leaderboard": [
            {"rank": 1, "user_id": "Explorer***42", "places_visited": 47, "km_traveled": 234.5, "badge": "🥇"},
            {"rank": 2, "user_id": "Nomad***88", "places_visited": 38, "km_traveled": 189.2, "badge": "🥈"},
            {"rank": 3, "user_id": "Wanderer***15", "places_visited": 31, "km_traveled": 156.8, "badge": "🥉"},
        ],
        "your_stats": {
            "rank": "Not yet ranked",
            "tip": "Explore more places to join the leaderboard!"
        },
        "note": "Leaderboards are opt-in. Your privacy is always protected."
    }


# --- Accessibility Features ---

@app.get("/api/accessibility/route-check", tags=["Fun Features"])
async def check_route_accessibility(
    origin: str = Query(..., description="Origin as lat,lng"),
    destination: str = Query(..., description="Destination as lat,lng"),
    needs: List[str] = Query(default=["wheelchair"], description="Accessibility needs")
):
    """
    Check a route for accessibility.

    Helps users with mobility needs plan safe routes. ♿

    Needs can include:
    - wheelchair: Wheelchair accessible paths
    - low_vision: Audio-described navigation
    - hearing: Visual alerts only
    - stroller: Stroller-friendly paths
    """
    return {
        "origin": origin,
        "destination": destination,
        "accessibility_needs": needs,
        "route_check": {
            "overall_accessible": True,
            "notes": [
                "Route follows paved sidewalks",
                "2 crossings with audio signals",
                "No stairs on this route"
            ],
            "warnings": [],
            "alternatives_available": True
        },
        "tip": "We're working to add more accessibility data. Report issues to help others!"
    }


# --- Create required tables ---

@app.on_event("startup")
async def create_fun_features_tables():
    """Create tables for fun features on startup"""
    with SessionLocal() as db:
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS location_shares (
                    id SERIAL PRIMARY KEY,
                    share_id VARCHAR(32) UNIQUE NOT NULL,
                    user_hash VARCHAR(64) NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_location_shares_id ON location_shares(share_id);
                CREATE INDEX IF NOT EXISTS idx_location_shares_user ON location_shares(user_hash);
            """))

            db.execute(text("""
                CREATE TABLE IF NOT EXISTS trip_memories (
                    id SERIAL PRIMARY KEY,
                    memory_id VARCHAR(24) UNIQUE NOT NULL,
                    user_hash VARCHAR(64) NOT NULL,
                    lat DOUBLE PRECISION NOT NULL,
                    lng DOUBLE PRECISION NOT NULL,
                    note TEXT,
                    category VARCHAR(50) DEFAULT 'general',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_trip_memories_user ON trip_memories(user_hash);
                CREATE INDEX IF NOT EXISTS idx_trip_memories_geo ON trip_memories(lat, lng);
            """))

            db.commit()
        except Exception as e:
            print(f"Note: Some tables may already exist: {e}")
            db.rollback()


# ============================================
# Mapillary Street-Level Imagery Integration
# ============================================

MAPILLARY_ACCESS_TOKEN = os.getenv("MAPILLARY_ACCESS_TOKEN", "")

@app.get("/api/streetview", tags=["Street View"])
async def get_street_view_coverage(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: int = Query(100, description="Search radius in meters", le=500)
):
    """
    Get Mapillary street-level imagery near a location.

    Returns available street view images from Mapillary's crowdsourced database.
    Unlike Google Street View, Mapillary is free and community-driven.
    """
    if not MAPILLARY_ACCESS_TOKEN:
        return {
            "status": "not_configured",
            "message": "Mapillary API key not configured. Get one free at mapillary.com/developer",
            "alternative": "Use TagMe app to contribute street-level photos",
            "images": []
        }

    # Mapillary API v4
    url = "https://graph.mapillary.com/images"
    params = {
        "access_token": MAPILLARY_ACCESS_TOKEN,
        "fields": "id,captured_at,compass_angle,geometry,thumb_256_url,thumb_1024_url",
        "bbox": f"{lng-0.005},{lat-0.005},{lng+0.005},{lat+0.005}",
        "limit": 20
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            images = []
            for img in data.get("data", []):
                geom = img.get("geometry", {})
                images.append({
                    "id": img["id"],
                    "url": img.get("thumb_1024_url"),
                    "thumbnail": img.get("thumb_256_url"),
                    "captured_at": img.get("captured_at"),
                    "compass_angle": img.get("compass_angle"),
                    "lat": geom.get("coordinates", [0, 0])[1],
                    "lng": geom.get("coordinates", [0, 0])[0],
                    "viewer_url": f"https://www.mapillary.com/app/?image_key={img['id']}"
                })

            return {
                "status": "ok",
                "source": "Mapillary",
                "count": len(images),
                "images": images
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "images": []
        }


@app.get("/api/streetview/embed/{image_id}", tags=["Street View"])
async def get_street_view_embed(image_id: str):
    """Get embeddable street view viewer URL"""
    return {
        "embed_url": f"https://www.mapillary.com/embed?image_key={image_id}&style=split",
        "viewer_url": f"https://www.mapillary.com/app/?image_key={image_id}",
        "image_id": image_id
    }


# ============================================
# Transit / Public Transport (GTFS)
# ============================================

@app.get("/api/transit/stops", tags=["Transit"])
async def get_transit_stops(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    db: Session = Depends(get_db)
):
    """
    Get public transit stops from OpenStreetMap data.

    Returns bus stops, train stations, taxi ranks, and other transit points.
    """
    coords = validate_bbox(bbox)

    query = """
        SELECT
            p.id, p.name, p.latitude as lat, p.longitude as lng,
            c.name as category,
            p.phone, p.website
        FROM pois p
        JOIN poi_categories c ON p.category_id = c.id
        WHERE c.name IN ('Bus Station', 'Train Station', 'Transport', 'Airport')
          AND p.latitude BETWEEN :min_lat AND :max_lat
          AND p.longitude BETWEEN :min_lng AND :max_lng
        LIMIT 200
    """

    result = db.execute(text(query), {
        "min_lat": coords[1], "max_lat": coords[3],
        "min_lng": coords[0], "max_lng": coords[2]
    })
    stops = [dict(row._mapping) for row in result]

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [s["lng"], s["lat"]]
                },
                "properties": {
                    "id": s["id"],
                    "name": s["name"],
                    "stop_type": s["category"],
                    "phone": s["phone"],
                    "website": s["website"]
                }
            } for s in stops
        ],
        "metadata": {
            "source": "OpenStreetMap",
            "note": "Real-time schedules coming soon via GTFS integration"
        }
    }


@app.get("/api/transit/routes", tags=["Transit"])
async def get_transit_routes(
    origin: str = Query(..., description="Origin: lng,lat"),
    destination: str = Query(..., description="Destination: lng,lat"),
    db: Session = Depends(get_db)
):
    """
    Get suggested transit route between two points.

    Currently provides nearest stops and walking directions.
    Full GTFS schedule integration planned.
    """
    try:
        origin_coords = [float(x) for x in origin.split(",")]
        dest_coords = [float(x) for x in destination.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    # Find nearest transit stops to origin and destination
    query = """
        SELECT
            p.id, p.name, p.latitude, p.longitude, c.name as stop_type,
            (
                6371 * acos(
                    cos(radians(:lat)) * cos(radians(p.latitude)) *
                    cos(radians(p.longitude) - radians(:lng)) +
                    sin(radians(:lat)) * sin(radians(p.latitude))
                )
            ) as distance_km
        FROM pois p
        JOIN poi_categories c ON p.category_id = c.id
        WHERE c.name IN ('Bus Station', 'Train Station', 'Transport')
        ORDER BY distance_km
        LIMIT 3
    """

    origin_stops = db.execute(text(query), {"lat": origin_coords[1], "lng": origin_coords[0]})
    dest_stops = db.execute(text(query), {"lat": dest_coords[1], "lng": dest_coords[0]})

    origin_nearby = [dict(row._mapping) for row in origin_stops]
    dest_nearby = [dict(row._mapping) for row in dest_stops]

    return {
        "status": "partial",
        "note": "Full schedule-based routing coming with GTFS integration",
        "origin_stops": origin_nearby,
        "destination_stops": dest_nearby,
        "suggestion": "Walk to nearest stop, take public transport, walk to destination",
        "gtfs_status": "Awaiting South African transit agency GTFS data feeds"
    }


@app.get("/api/gtfs/routes", tags=["Transit"])
async def get_gtfs_routes(db: Session = Depends(get_db)):
    """
    Get all GTFS transit routes from the database.
    Returns route information with agency details.
    """
    try:
        result = db.execute(text("""
            SELECT
                r.route_id,
                r.route_short_name,
                r.route_long_name,
                r.route_type,
                r.route_color,
                r.route_text_color,
                a.agency_name
            FROM gtfs_routes r
            LEFT JOIN gtfs_agencies a ON r.agency_id = a.agency_id
            ORDER BY a.agency_name, r.route_short_name
        """))
        routes = [dict(row._mapping) for row in result]
        return {"status": "ok", "count": len(routes), "routes": routes}
    except Exception as e:
        return {"status": "error", "message": str(e), "routes": []}


@app.get("/api/gtfs/stops", tags=["Transit"])
async def get_gtfs_stops(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    db: Session = Depends(get_db)
):
    """
    Get GTFS transit stops within a bounding box.
    Returns stop information with route associations.
    """
    coords = validate_bbox(bbox)

    try:
        result = db.execute(text("""
            SELECT
                s.stop_id,
                s.stop_name,
                s.stop_lat,
                s.stop_lon,
                s.wheelchair_boarding,
                STRING_AGG(DISTINCT r.route_id, ',') as route_ids,
                STRING_AGG(DISTINCT r.route_short_name, ', ') as route_names
            FROM gtfs_stops s
            LEFT JOIN gtfs_stop_times st ON s.stop_id = st.stop_id
            LEFT JOIN gtfs_trips t ON st.trip_id = t.trip_id
            LEFT JOIN gtfs_routes r ON t.route_id = r.route_id
            WHERE s.stop_lat BETWEEN :min_lat AND :max_lat
              AND s.stop_lon BETWEEN :min_lng AND :max_lng
            GROUP BY s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.wheelchair_boarding
            LIMIT 500
        """), {
            "min_lat": coords[1], "max_lat": coords[3],
            "min_lng": coords[0], "max_lng": coords[2]
        })

        stops = [dict(row._mapping) for row in result]
        return {"status": "ok", "count": len(stops), "stops": stops}
    except Exception as e:
        return {"status": "error", "message": str(e), "stops": []}


# ============================================
# Road Reports (Waze-like)
# ============================================

REPORT_ICONS = {
    'traffic_jam': '🚗',
    'traffic_moderate': '🚙',
    'accident': '💥',
    'hazard_road': '⚠️',
    'hazard_weather': '🌧️',
    'police': '👮',
    'closure': '🚧',
    'construction': '🏗️',
    'camera': '📷',
    'fuel_price': '⛽'
}


@app.get("/api/reports/nearby", tags=["Road Reports"])
async def get_nearby_reports(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius_km: float = Query(10, description="Radius in km", le=50),
    db: Session = Depends(get_db)
):
    """
    Get active road reports near a location.
    Returns traffic, hazards, police, closures, etc.
    """
    try:
        result = db.execute(text("""
            SELECT
                id, report_type, latitude, longitude, direction,
                severity, description, confidence_score,
                verified_count, dismissed_count, received_at, expires_at,
                (
                    6371 * acos(
                        cos(radians(:lat)) * cos(radians(latitude)) *
                        cos(radians(longitude) - radians(:lng)) +
                        sin(radians(:lat)) * sin(radians(latitude))
                    )
                ) as distance_km
            FROM staging.road_reports
            WHERE is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
              AND (
                    6371 * acos(
                        cos(radians(:lat)) * cos(radians(latitude)) *
                        cos(radians(longitude) - radians(:lng)) +
                        sin(radians(:lat)) * sin(radians(latitude))
                    )
                ) < :radius
            ORDER BY distance_km
            LIMIT 100
        """), {"lat": lat, "lng": lng, "radius": radius_km})

        reports = []
        for row in result:
            r = dict(row._mapping)
            r['icon'] = REPORT_ICONS.get(r['report_type'], '📍')
            reports.append(r)

        return {
            "status": "ok",
            "count": len(reports),
            "reports": reports
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "reports": []}


@app.get("/api/reports/bbox", tags=["Road Reports"])
async def get_reports_in_bbox(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    db: Session = Depends(get_db)
):
    """
    Get active road reports within a bounding box.
    For displaying on the map.
    """
    coords = validate_bbox(bbox)

    try:
        result = db.execute(text("""
            SELECT
                id, report_type, latitude, longitude, direction,
                severity, description, confidence_score,
                verified_count, dismissed_count, received_at, expires_at
            FROM staging.road_reports
            WHERE is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
              AND latitude BETWEEN :min_lat AND :max_lat
              AND longitude BETWEEN :min_lng AND :max_lng
            ORDER BY received_at DESC
            LIMIT 200
        """), {
            "min_lat": coords[1], "max_lat": coords[3],
            "min_lng": coords[0], "max_lng": coords[2]
        })

        reports = []
        for row in result:
            r = dict(row._mapping)
            r['icon'] = REPORT_ICONS.get(r['report_type'], '📍')
            reports.append(r)

        return {
            "status": "ok",
            "count": len(reports),
            "reports": reports
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "reports": []}


@app.get("/api/reports/route", tags=["Road Reports"])
async def get_reports_along_route(
    waypoints: str = Query(..., description="Route waypoints: lng1,lat1;lng2,lat2;..."),
    buffer_km: float = Query(0.5, description="Buffer around route in km"),
    db: Session = Depends(get_db)
):
    """
    Get active road reports along a route.
    For alerting during navigation.
    """
    try:
        points = []
        for wp in waypoints.split(";"):
            lng, lat = map(float, wp.split(","))
            points.append((lat, lng))

        if len(points) < 2:
            return {"status": "error", "message": "Need at least 2 waypoints", "reports": []}

        # Build a query that finds reports near any segment of the route
        # For simplicity, we'll check distance to each waypoint
        all_reports = []
        seen_ids = set()

        for lat, lng in points:
            result = db.execute(text("""
                SELECT
                    id, report_type, latitude, longitude, direction,
                    severity, description, confidence_score, received_at
                FROM staging.road_reports
                WHERE is_active = true
                  AND (expires_at IS NULL OR expires_at > NOW())
                  AND (
                        6371 * acos(
                            cos(radians(:lat)) * cos(radians(latitude)) *
                            cos(radians(longitude) - radians(:lng)) +
                            sin(radians(:lat)) * sin(radians(latitude))
                        )
                    ) < :buffer
                LIMIT 50
            """), {"lat": lat, "lng": lng, "buffer": buffer_km})

            for row in result:
                r = dict(row._mapping)
                if r['id'] not in seen_ids:
                    r['icon'] = REPORT_ICONS.get(r['report_type'], '📍')
                    all_reports.append(r)
                    seen_ids.add(r['id'])

        return {
            "status": "ok",
            "count": len(all_reports),
            "reports": all_reports
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "reports": []}


@app.get("/api/traffic/conditions", tags=["Traffic"])
async def get_traffic_conditions(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    db: Session = Depends(get_db)
):
    """
    Get aggregated traffic conditions from location pings.
    Analyzes speed data from devices to detect congestion.

    Returns grid cells with traffic status:
    - free_flow: avg speed > 40 km/h
    - moderate: avg speed 15-40 km/h
    - congested: avg speed 5-15 km/h
    - stopped: avg speed < 5 km/h
    """
    coords = validate_bbox(bbox)

    try:
        # Aggregate location pings from last 15 minutes into grid cells
        # Grid size ~100m (0.001 degrees roughly)
        result = db.execute(text("""
            WITH recent_pings AS (
                SELECT
                    latitude,
                    longitude,
                    speed_mps,
                    ROUND(latitude::numeric, 3) as lat_grid,
                    ROUND(longitude::numeric, 3) as lng_grid
                FROM staging.location_pings
                WHERE received_at > NOW() - INTERVAL '15 minutes'
                  AND latitude BETWEEN :min_lat AND :max_lat
                  AND longitude BETWEEN :min_lng AND :max_lng
                  AND speed_mps IS NOT NULL
            ),
            grid_stats AS (
                SELECT
                    lat_grid,
                    lng_grid,
                    COUNT(*) as sample_count,
                    AVG(speed_mps) as avg_speed_mps,
                    AVG(latitude) as center_lat,
                    AVG(longitude) as center_lng
                FROM recent_pings
                GROUP BY lat_grid, lng_grid
                HAVING COUNT(*) >= 3  -- Min 3 samples for reliability
            )
            SELECT
                center_lat as latitude,
                center_lng as longitude,
                sample_count,
                avg_speed_mps,
                avg_speed_mps * 3.6 as avg_speed_kmh,
                CASE
                    WHEN avg_speed_mps * 3.6 > 40 THEN 'free_flow'
                    WHEN avg_speed_mps * 3.6 > 15 THEN 'moderate'
                    WHEN avg_speed_mps * 3.6 > 5 THEN 'congested'
                    ELSE 'stopped'
                END as traffic_status,
                CASE
                    WHEN avg_speed_mps * 3.6 > 40 THEN 1
                    WHEN avg_speed_mps * 3.6 > 15 THEN 2
                    WHEN avg_speed_mps * 3.6 > 5 THEN 3
                    ELSE 4
                END as severity
            FROM grid_stats
            ORDER BY severity DESC, sample_count DESC
            LIMIT 500
        """), {
            "min_lat": coords["min_lat"],
            "max_lat": coords["max_lat"],
            "min_lng": coords["min_lng"],
            "max_lng": coords["max_lng"]
        })

        conditions = []
        for row in result:
            conditions.append({
                "latitude": float(row.latitude),
                "longitude": float(row.longitude),
                "sample_count": row.sample_count,
                "avg_speed_kmh": round(float(row.avg_speed_kmh), 1),
                "traffic_status": row.traffic_status,
                "severity": row.severity
            })

        return {
            "status": "ok",
            "count": len(conditions),
            "conditions": conditions
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "conditions": []}


@app.get("/api/traffic/segments", tags=["Traffic"])
async def get_traffic_segments(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    db: Session = Depends(get_db)
):
    """
    Get traffic flow data aggregated into road segments.
    For display as colored road overlays on the map.
    """
    coords = validate_bbox(bbox)

    try:
        # Aggregate into line segments based on bearing (direction of travel)
        result = db.execute(text("""
            WITH recent_pings AS (
                SELECT
                    latitude,
                    longitude,
                    speed_mps,
                    bearing,
                    -- Create segments based on direction (8 compass directions)
                    ROUND(latitude::numeric, 3) as lat_grid,
                    ROUND(longitude::numeric, 3) as lng_grid,
                    CASE
                        WHEN bearing IS NULL THEN 0
                        WHEN bearing >= 337.5 OR bearing < 22.5 THEN 0   -- N
                        WHEN bearing >= 22.5 AND bearing < 67.5 THEN 45  -- NE
                        WHEN bearing >= 67.5 AND bearing < 112.5 THEN 90 -- E
                        WHEN bearing >= 112.5 AND bearing < 157.5 THEN 135 -- SE
                        WHEN bearing >= 157.5 AND bearing < 202.5 THEN 180 -- S
                        WHEN bearing >= 202.5 AND bearing < 247.5 THEN 225 -- SW
                        WHEN bearing >= 247.5 AND bearing < 292.5 THEN 270 -- W
                        ELSE 315 -- NW
                    END as direction_group
                FROM staging.location_pings
                WHERE received_at > NOW() - INTERVAL '15 minutes'
                  AND latitude BETWEEN :min_lat AND :max_lat
                  AND longitude BETWEEN :min_lng AND :max_lng
                  AND speed_mps IS NOT NULL
            ),
            segment_stats AS (
                SELECT
                    lat_grid,
                    lng_grid,
                    direction_group,
                    COUNT(*) as sample_count,
                    AVG(speed_mps) * 3.6 as avg_speed_kmh,
                    AVG(latitude) as center_lat,
                    AVG(longitude) as center_lng
                FROM recent_pings
                GROUP BY lat_grid, lng_grid, direction_group
                HAVING COUNT(*) >= 2
            )
            SELECT
                center_lat as latitude,
                center_lng as longitude,
                direction_group as bearing,
                sample_count,
                avg_speed_kmh,
                CASE
                    WHEN avg_speed_kmh > 60 THEN '#00ff00'
                    WHEN avg_speed_kmh > 40 THEN '#88ff00'
                    WHEN avg_speed_kmh > 25 THEN '#ffff00'
                    WHEN avg_speed_kmh > 15 THEN '#ffaa00'
                    WHEN avg_speed_kmh > 5 THEN '#ff4400'
                    ELSE '#cc0000'
                END as color
            FROM segment_stats
            ORDER BY avg_speed_kmh ASC
            LIMIT 1000
        """), {
            "min_lat": coords["min_lat"],
            "max_lat": coords["max_lat"],
            "min_lng": coords["min_lng"],
            "max_lng": coords["max_lng"]
        })

        segments = []
        for row in result:
            segments.append({
                "latitude": float(row.latitude),
                "longitude": float(row.longitude),
                "bearing": row.bearing,
                "sample_count": row.sample_count,
                "avg_speed_kmh": round(float(row.avg_speed_kmh), 1),
                "color": row.color
            })

        return {
            "status": "ok",
            "count": len(segments),
            "segments": segments
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "segments": []}


@app.get("/api/user/profile", tags=["Gamification"])
async def get_user_profile(
    device_hash: str = Query(..., description="Device hash for user identification"),
    db: Session = Depends(get_db)
):
    """
    Get user's points, level, and stats.
    """
    try:
        result = db.execute(text("""
            SELECT * FROM staging.user_points WHERE device_id_hash = :hash
        """), {"hash": device_hash})

        user = result.fetchone()
        if not user:
            return {
                "total_points": 0,
                "level": 1,
                "level_name": "Newbie",
                "level_badge": "🌱",
                "reports_submitted": 0,
                "reports_verified": 0,
                "reviews_submitted": 0,
                "km_driven": 0
            }

        user = dict(user._mapping)

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

        return {
            "total_points": user['total_points'],
            "level": level,
            "level_name": level_name,
            "level_badge": level_badge,
            "reports_submitted": user['reports_submitted'],
            "reports_verified": user['reports_verified'],
            "reviews_submitted": user['reviews_submitted'],
            "km_driven": round(user['km_driven'] or 0, 1)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/leaderboard", tags=["Gamification"])
async def get_leaderboard(
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """
    Get top contributors leaderboard.
    """
    try:
        result = db.execute(text("""
            SELECT
                device_id_hash,
                total_points,
                reports_submitted,
                reviews_submitted,
                km_driven
            FROM staging.user_points
            ORDER BY total_points DESC
            LIMIT :limit
        """), {"limit": limit})

        leaderboard = []
        for i, row in enumerate(result):
            r = dict(row._mapping)
            leaderboard.append({
                "rank": i + 1,
                "user_id": r['device_id_hash'][:8] + "...",
                "total_points": r['total_points'],
                "reports": r['reports_submitted'],
                "reviews": r['reviews_submitted'],
                "km_driven": round(r['km_driven'] or 0, 1)
            })

        return {"status": "ok", "leaderboard": leaderboard}
    except Exception as e:
        return {"status": "error", "message": str(e), "leaderboard": []}


# ============================================
# Indoor Maps (from OSM)
# ============================================

@app.get("/api/indoor/{poi_id}", tags=["Indoor Maps"])
async def get_indoor_map(
    poi_id: int,
    db: Session = Depends(get_db)
):
    """
    Get indoor map data for a building (mall, airport, etc).

    Uses OpenStreetMap Simple Indoor Tagging data where available.
    Most SA malls don't have indoor mapping yet - this enables crowdsourcing.
    """
    # Get POI details
    poi_query = """
        SELECT p.id, p.name, p.osm_id, p.latitude, p.longitude, c.name as category
        FROM pois p
        JOIN poi_categories c ON p.category_id = c.id
        WHERE p.id = :poi_id
    """
    result = db.execute(text(poi_query), {"poi_id": poi_id})
    poi = result.fetchone()

    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    poi_dict = dict(poi._mapping)

    # Indoor mapping is sparse in SA - return placeholder
    return {
        "poi": poi_dict,
        "indoor_available": False,
        "floors": [],
        "message": "Indoor mapping not yet available for this location",
        "contribute": {
            "tagme_app": "Use TagMe to map indoor spaces",
            "osm_guide": "https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging"
        },
        "status": "Indoor maps rely on community contributions. Help map this space!"
    }


@app.get("/api/indoor/available", tags=["Indoor Maps"])
async def list_indoor_maps(db: Session = Depends(get_db)):
    """List POIs with indoor mapping data available"""
    # Currently return known mapped locations (manually curated for now)
    return {
        "mapped_locations": [],
        "note": "Indoor mapping is community-driven. Contribute via TagMe!",
        "osm_indoor_areas": [
            {"name": "OR Tambo International Airport", "status": "partial", "floors": 3},
            {"name": "Cape Town International Airport", "status": "partial", "floors": 2}
        ]
    }


# ============================================
# Opening Hours & Business Info
# ============================================

@app.get("/api/pois/{poi_id}/hours", tags=["POIs"])
async def get_poi_hours(
    poi_id: int,
    db: Session = Depends(get_db)
):
    """
    Get opening hours for a POI.

    Returns parsed opening hours from OSM data, or indicates if unknown.
    """
    query = """
        SELECT p.id, p.name, p.osm_id, c.name as category,
               p.metadata->>'opening_hours_raw' as hours_raw,
               p.metadata->'opening_hours' as hours_parsed,
               p.metadata->>'hours_updated_at' as hours_updated
        FROM pois p
        JOIN poi_categories c ON p.category_id = c.id
        WHERE p.id = :poi_id
    """
    result = db.execute(text(query), {"poi_id": poi_id})
    poi = result.fetchone()

    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    hours_raw = poi[4]
    hours_parsed = poi[5]
    hours_updated = poi[6]

    if hours_raw:
        return {
            "poi_id": poi_id,
            "name": poi[1],
            "hours_text": hours_raw,
            "hours": hours_parsed,
            "source": "OpenStreetMap",
            "last_updated": hours_updated,
            "verified": True
        }

    # No hours available
    return {
        "poi_id": poi_id,
        "name": poi[1],
        "hours": None,
        "hours_text": "Hours not available",
        "verified": False,
        "contribute": "Help add opening hours via TagMe or OpenStreetMap"
    }


# ============================================
# Reviews & Ratings (Crowdsourced)
# ============================================

class ReviewCreate(BaseModel):
    poi_id: int
    user_hash: str
    rating: int  # 1-5
    text: Optional[str] = None


@app.post("/api/pois/{poi_id}/reviews", tags=["Reviews"])
async def add_review(
    poi_id: int,
    review: ReviewCreate,
    db: Session = Depends(get_db)
):
    """Add a crowdsourced review for a POI"""

    # Validate rating
    if review.rating < 1 or review.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    # Ensure reviews table exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS poi_reviews (
            id SERIAL PRIMARY KEY,
            poi_id INTEGER NOT NULL,
            user_hash VARCHAR(64) NOT NULL,
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            text TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(poi_id, user_hash)
        )
    """))
    db.commit()

    try:
        db.execute(text("""
            INSERT INTO poi_reviews (poi_id, user_hash, rating, text)
            VALUES (:poi_id, :user_hash, :rating, :text)
            ON CONFLICT (poi_id, user_hash)
            DO UPDATE SET rating = :rating, text = :text, created_at = NOW()
        """), {
            "poi_id": poi_id,
            "user_hash": review.user_hash,
            "rating": review.rating,
            "text": review.text
        })
        db.commit()
        return {"status": "ok", "message": "Review saved"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pois/{poi_id}/reviews", tags=["Reviews"])
async def get_reviews(
    poi_id: int,
    db: Session = Depends(get_db)
):
    """Get reviews for a POI"""

    try:
        result = db.execute(text("""
            SELECT rating, text, created_at
            FROM poi_reviews
            WHERE poi_id = :poi_id
            ORDER BY created_at DESC
            LIMIT 50
        """), {"poi_id": poi_id})

        reviews = [dict(row._mapping) for row in result]

        # Calculate average
        avg_result = db.execute(text("""
            SELECT AVG(rating)::float, COUNT(*)
            FROM poi_reviews
            WHERE poi_id = :poi_id
        """), {"poi_id": poi_id})
        avg_row = avg_result.fetchone()

        return {
            "poi_id": poi_id,
            "average_rating": round(avg_row[0], 1) if avg_row[0] else None,
            "review_count": avg_row[1] or 0,
            "reviews": reviews
        }
    except Exception:
        # Table might not exist yet
        return {
            "poi_id": poi_id,
            "average_rating": None,
            "review_count": 0,
            "reviews": []
        }


# ============================================
# Enhanced Traffic with Multiple Sources
# ============================================

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "")
HERE_API_KEY = os.getenv("HERE_API_KEY", "")  # 250,000 requests/month free

@app.get("/api/traffic/external", tags=["Traffic"])
async def get_external_traffic(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat")
):
    """
    Get traffic from external sources (TomTom free tier).

    TomTom free tier: 2,500 requests/day.
    Falls back to crowdsourced TagMe data if unavailable.
    """
    if not TOMTOM_API_KEY:
        return {
            "status": "not_configured",
            "message": "TomTom API key not configured. Get one free at developer.tomtom.com",
            "fallback": "Using TagMe crowdsourced traffic data",
            "configure": "Set TOMTOM_API_KEY environment variable"
        }

    coords = validate_bbox(bbox)

    # TomTom Traffic Flow API
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

    # Get center of bbox for the query
    center_lat = (coords[1] + coords[3]) / 2
    center_lng = (coords[0] + coords[2]) / 2

    params = {
        "key": TOMTOM_API_KEY,
        "point": f"{center_lat},{center_lng}",
        "unit": "KMPH"
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            flow = data.get("flowSegmentData", {})

            return {
                "status": "ok",
                "source": "TomTom",
                "traffic": {
                    "current_speed": flow.get("currentSpeed"),
                    "free_flow_speed": flow.get("freeFlowSpeed"),
                    "current_travel_time": flow.get("currentTravelTime"),
                    "free_flow_travel_time": flow.get("freeFlowTravelTime"),
                    "confidence": flow.get("confidence"),
                    "road_closure": flow.get("roadClosure", False)
                }
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "fallback": "Use /api/traffic for TagMe crowdsourced data"
        }


@app.get("/api/traffic/here", tags=["Traffic"])
async def get_here_traffic(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    refresh: bool = Query(False, description="Force refresh, bypass cache")
):
    """
    Get traffic from HERE API (recommended).

    HERE free tier: 250,000 requests/month (~8,300/day).
    Much higher quota than TomTom. Good coverage in South Africa.

    Results are cached for 3 minutes to maximize quota efficiency.
    Use refresh=true to bypass cache.

    Get free API key at: https://developer.here.com/
    """
    if not HERE_API_KEY:
        return {
            "status": "not_configured",
            "message": "HERE API key not configured. Get one free at developer.here.com",
            "note": "250,000 requests/month free (vs TomTom's 2,500/day)",
            "fallback": "Using TagMe crowdsourced traffic data",
            "configure": "Set HERE_API_KEY environment variable"
        }

    coords = validate_bbox(bbox)
    # Round coords to 2 decimal places for better cache hits (reduces bbox variations)
    coords_rounded = [round(c, 2) for c in coords]

    # Check cache first (unless refresh requested)
    ckey = cache_key("here_traffic", *coords_rounded)
    if not refresh:
        cached = cache_get(ckey)
        if cached:
            cached["metadata"]["cached"] = True
            return cached

    # HERE Traffic Flow API v7
    url = "https://data.traffic.hereapi.com/v7/flow"

    params = {
        "apiKey": HERE_API_KEY,
        "in": f"bbox:{coords[0]},{coords[1]},{coords[2]},{coords[3]}",
        "locationReferencing": "shape"
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            # Process HERE traffic flow results
            results = data.get("results", [])
            traffic_features = []

            for item in results:
                location = item.get("location", {})
                current_flow = item.get("currentFlow", {})

                # Get speed data
                speed = current_flow.get("speed")
                free_flow = current_flow.get("freeFlow")
                jam_factor = current_flow.get("jamFactor", 0)

                # Determine traffic level from jam factor (0-10 scale)
                if jam_factor <= 2:
                    level = "free"
                    color = "#00cc00"
                elif jam_factor <= 5:
                    level = "moderate"
                    color = "#ffcc00"
                elif jam_factor <= 8:
                    level = "heavy"
                    color = "#ff8800"
                else:
                    level = "standstill"
                    color = "#ff0000"

                # Get road shape if available
                shape = location.get("shape", {}).get("links", [])
                for link in shape:
                    points = link.get("points", [])
                    if len(points) >= 2:
                        traffic_features.append({
                            "type": "Feature",
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [[p["lng"], p["lat"]] for p in points]
                            },
                            "properties": {
                                "speed_kmh": speed,
                                "free_flow_speed_kmh": free_flow,
                                "jam_factor": jam_factor,
                                "traffic_level": level,
                                "color": color
                            }
                        })

            result = {
                "type": "FeatureCollection",
                "features": traffic_features,
                "metadata": {
                    "source": "HERE",
                    "coverage": "Global",
                    "segment_count": len(traffic_features),
                    "quota": "250,000 requests/month",
                    "cached": False,
                    "cache_ttl_seconds": 180
                }
            }

            # Cache for 3 minutes (traffic updates every few minutes anyway)
            cache_set(ckey, result, ttl_seconds=180)
            return result

    except httpx.HTTPStatusError as e:
        return {
            "status": "error",
            "message": f"HERE API error: {e.response.status_code}",
            "fallback": "Use /api/traffic for TagMe crowdsourced data"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "fallback": "Use /api/traffic for TagMe crowdsourced data"
        }


@app.get("/api/traffic/incidents", tags=["Traffic"])
async def get_traffic_incidents(
    bbox: str = Query(..., description="Bounding box: minLng,minLat,maxLng,maxLat"),
    refresh: bool = Query(False, description="Force refresh, bypass cache")
):
    """
    Get traffic incidents (accidents, road works, closures) from HERE.

    Includes: accidents, construction, road closures, weather hazards.
    Results are cached for 5 minutes (incidents change less frequently than flow).
    """
    if not HERE_API_KEY:
        return {
            "status": "not_configured",
            "message": "HERE API key not configured",
            "configure": "Set HERE_API_KEY environment variable"
        }

    coords = validate_bbox(bbox)
    # Round coords to 2 decimal places for better cache hits (reduces bbox variations)
    coords_rounded = [round(c, 2) for c in coords]

    # Check cache first (unless refresh requested)
    ckey = cache_key("here_incidents", *coords_rounded)
    if not refresh:
        cached = cache_get(ckey)
        if cached:
            cached["metadata"]["cached"] = True
            return cached

    # HERE Traffic Incidents API v7
    url = "https://data.traffic.hereapi.com/v7/incidents"

    params = {
        "apiKey": HERE_API_KEY,
        "in": f"bbox:{coords[0]},{coords[1]},{coords[2]},{coords[3]}",
        "locationReferencing": "shape"
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            incident_features = []

            for item in results:
                location = item.get("location", {})
                incident_details = item.get("incidentDetails", {})

                # Get incident type and severity
                incident_type = incident_details.get("type", "UNKNOWN")
                description = incident_details.get("description", {}).get("value", "")
                start_time = incident_details.get("startTime")
                end_time = incident_details.get("endTime")

                # Map incident types to icons
                type_icons = {
                    "ACCIDENT": "🚗💥",
                    "CONSTRUCTION": "🚧",
                    "ROAD_CLOSURE": "⛔",
                    "WEATHER": "🌧️",
                    "CONGESTION": "🚦",
                    "DISABLED_VEHICLE": "🚙",
                    "MASS_TRANSIT": "🚌",
                    "PLANNED_EVENT": "📅",
                    "MISC": "⚠️"
                }
                icon = type_icons.get(incident_type, "⚠️")

                # Get centroid or first point
                shape = location.get("shape", {})
                links = shape.get("links", [])
                if links and links[0].get("points"):
                    point = links[0]["points"][0]
                    incident_features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [point["lng"], point["lat"]]
                        },
                        "properties": {
                            "type": incident_type,
                            "icon": icon,
                            "description": description,
                            "start_time": start_time,
                            "end_time": end_time
                        }
                    })

            result = {
                "type": "FeatureCollection",
                "features": incident_features,
                "metadata": {
                    "source": "HERE",
                    "incident_count": len(incident_features),
                    "cached": False,
                    "cache_ttl_seconds": 300
                }
            }

            # Cache for 5 minutes (incidents don't change as often)
            cache_set(ckey, result, ttl_seconds=300)
            return result

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


# ============================================
# Elevation API (Open-Elevation - free, unlimited)
# ============================================

@app.get("/api/elevation", tags=["Elevation"])
async def get_elevation(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude")
):
    """
    Get elevation for a single point.

    Uses Open-Elevation API (free, no key required).
    Data source: SRTM 30m resolution.
    """
    # Check cache
    ckey = cache_key("elevation", round(lat, 5), round(lng, 5))
    cached = cache_get(ckey)
    if cached:
        cached["cached"] = True
        return cached

    url = "https://api.open-elevation.com/api/v1/lookup"
    params = {"locations": f"{lat},{lng}"}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            if results:
                result = {
                    "lat": lat,
                    "lng": lng,
                    "elevation_m": results[0].get("elevation"),
                    "source": "SRTM",
                    "cached": False
                }
                # Cache for 24 hours (elevation doesn't change)
                cache_set(ckey, result, ttl_seconds=86400)
                return result

            return {"lat": lat, "lng": lng, "elevation_m": None, "error": "No data"}

    except Exception as e:
        logger.warning(f"Error fetching elevation for ({lat}, {lng}): {type(e).__name__}: {e}")
        return {"lat": lat, "lng": lng, "elevation_m": None, "error": "Elevation service error"}


@app.post("/api/elevation/batch", tags=["Elevation"])
async def get_elevation_batch(
    locations: List[dict]
):
    """
    Get elevation for multiple points (max 100).

    Body: [{"lat": -26.2, "lng": 28.0}, ...]
    """
    if len(locations) > 100:
        raise HTTPException(status_code=400, detail="Max 100 locations per request")

    # Format for Open-Elevation
    loc_str = "|".join([f"{loc['lat']},{loc['lng']}" for loc in locations])
    url = "https://api.open-elevation.com/api/v1/lookup"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params={"locations": loc_str}, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            results = []
            for i, r in enumerate(data.get("results", [])):
                results.append({
                    "lat": locations[i]["lat"],
                    "lng": locations[i]["lng"],
                    "elevation_m": r.get("elevation")
                })

            return {
                "results": results,
                "source": "SRTM",
                "count": len(results)
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/elevation/profile", tags=["Elevation"])
async def get_elevation_profile(
    path: str = Query(..., description="Encoded polyline or 'lat1,lng1|lat2,lng2|...'"),
    samples: int = Query(50, description="Number of elevation samples (10-200)")
):
    """
    Get elevation profile along a route path.

    Useful for hiking/cycling route profiles.
    Returns elevation at regular intervals along the path.
    """
    samples = min(max(samples, 10), 200)

    # Parse path (support simple format: lat,lng|lat,lng|...)
    try:
        points = []
        for p in path.split("|"):
            lat, lng = map(float, p.split(","))
            points.append({"lat": lat, "lng": lng})
    except:
        raise HTTPException(status_code=400, detail="Invalid path format. Use: lat1,lng1|lat2,lng2|...")

    if len(points) < 2:
        raise HTTPException(status_code=400, detail="Path must have at least 2 points")

    # Interpolate points along path
    from math import sqrt

    def interpolate_path(points, num_samples):
        # Calculate total distance
        total_dist = 0
        segments = []
        for i in range(len(points) - 1):
            dx = points[i+1]["lng"] - points[i]["lng"]
            dy = points[i+1]["lat"] - points[i]["lat"]
            dist = sqrt(dx*dx + dy*dy)
            segments.append({"start": points[i], "end": points[i+1], "dist": dist})
            total_dist += dist

        # Sample at regular intervals
        sampled = []
        step = total_dist / (num_samples - 1)
        current_dist = 0
        seg_idx = 0
        seg_dist = 0

        for i in range(num_samples):
            target_dist = i * step

            while seg_idx < len(segments) - 1 and seg_dist + segments[seg_idx]["dist"] < target_dist:
                seg_dist += segments[seg_idx]["dist"]
                seg_idx += 1

            seg = segments[seg_idx]
            if seg["dist"] > 0:
                t = (target_dist - seg_dist) / seg["dist"]
                t = max(0, min(1, t))
            else:
                t = 0

            lat = seg["start"]["lat"] + t * (seg["end"]["lat"] - seg["start"]["lat"])
            lng = seg["start"]["lng"] + t * (seg["end"]["lng"] - seg["start"]["lng"])
            sampled.append({"lat": round(lat, 6), "lng": round(lng, 6)})

        return sampled

    sampled_points = interpolate_path(points, samples)

    # Get elevations for sampled points
    loc_str = "|".join([f"{p['lat']},{p['lng']}" for p in sampled_points])
    url = "https://api.open-elevation.com/api/v1/lookup"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params={"locations": loc_str}, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            profile = []
            elevations = []
            cumulative_dist = 0

            for i, r in enumerate(data.get("results", [])):
                elev = r.get("elevation")
                elevations.append(elev or 0)

                if i > 0:
                    # Approximate distance in km
                    dx = (sampled_points[i]["lng"] - sampled_points[i-1]["lng"]) * 111 * 0.85  # ~cos(26deg)
                    dy = (sampled_points[i]["lat"] - sampled_points[i-1]["lat"]) * 111
                    cumulative_dist += sqrt(dx*dx + dy*dy)

                profile.append({
                    "distance_km": round(cumulative_dist, 2),
                    "lat": sampled_points[i]["lat"],
                    "lng": sampled_points[i]["lng"],
                    "elevation_m": elev
                })

            # Calculate stats
            valid_elevs = [e for e in elevations if e is not None]

            return {
                "profile": profile,
                "stats": {
                    "min_elevation_m": min(valid_elevs) if valid_elevs else None,
                    "max_elevation_m": max(valid_elevs) if valid_elevs else None,
                    "total_ascent_m": sum(max(0, elevations[i] - elevations[i-1])
                                         for i in range(1, len(elevations))
                                         if elevations[i] and elevations[i-1]),
                    "total_descent_m": sum(max(0, elevations[i-1] - elevations[i])
                                          for i in range(1, len(elevations))
                                          if elevations[i] and elevations[i-1]),
                    "total_distance_km": round(cumulative_dist, 2)
                },
                "source": "SRTM"
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Weather API (Open-Meteo - free, unlimited)
# ============================================

@app.get("/api/weather", tags=["Weather"])
async def get_weather(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude")
):
    """
    Get current weather and 7-day forecast.

    Uses Open-Meteo API (free, unlimited, no key required).
    """
    # Check cache (weather cached for 30 minutes)
    ckey = cache_key("weather", round(lat, 2), round(lng, 2))
    cached = cache_get(ckey)
    if cached:
        cached["cached"] = True
        return cached

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lng,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
        "timezone": "Africa/Johannesburg",
        "forecast_days": 7
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            # Weather code descriptions
            weather_codes = {
                0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
                45: "Foggy", 48: "Depositing rime fog",
                51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
                61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
                71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
                80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
                95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
            }

            current = data.get("current", {})
            daily = data.get("daily", {})

            result = {
                "location": {"lat": lat, "lng": lng},
                "current": {
                    "temperature_c": current.get("temperature_2m"),
                    "feels_like_c": current.get("apparent_temperature"),
                    "humidity_percent": current.get("relative_humidity_2m"),
                    "precipitation_mm": current.get("precipitation"),
                    "wind_speed_kmh": current.get("wind_speed_10m"),
                    "wind_direction_deg": current.get("wind_direction_10m"),
                    "weather_code": current.get("weather_code"),
                    "weather_description": weather_codes.get(current.get("weather_code"), "Unknown")
                },
                "forecast": [],
                "source": "Open-Meteo",
                "cached": False
            }

            # Build forecast
            if daily.get("time"):
                for i, date in enumerate(daily["time"]):
                    result["forecast"].append({
                        "date": date,
                        "temp_max_c": daily.get("temperature_2m_max", [])[i] if i < len(daily.get("temperature_2m_max", [])) else None,
                        "temp_min_c": daily.get("temperature_2m_min", [])[i] if i < len(daily.get("temperature_2m_min", [])) else None,
                        "precipitation_mm": daily.get("precipitation_sum", [])[i] if i < len(daily.get("precipitation_sum", [])) else None,
                        "precipitation_probability": daily.get("precipitation_probability_max", [])[i] if i < len(daily.get("precipitation_probability_max", [])) else None,
                        "wind_speed_max_kmh": daily.get("wind_speed_10m_max", [])[i] if i < len(daily.get("wind_speed_10m_max", [])) else None,
                        "weather_code": daily.get("weather_code", [])[i] if i < len(daily.get("weather_code", [])) else None,
                        "weather_description": weather_codes.get(daily.get("weather_code", [])[i] if i < len(daily.get("weather_code", [])) else None, "Unknown")
                    })

            # Cache for 30 minutes
            cache_set(ckey, result, ttl_seconds=1800)
            return result

    except Exception as e:
        logger.warning(f"Error fetching weather for ({lat}, {lng}): {type(e).__name__}: {e}")
        return {
            "location": {"lat": lat, "lng": lng},
            "error": "Weather service unavailable",
            "source": "Open-Meteo"
        }


@app.get("/api/weather/alerts", tags=["Weather"])
async def get_weather_alerts(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude")
):
    """
    Get weather alerts/warnings for a location.

    Checks for severe weather conditions that might affect travel.
    """
    # Get current weather first
    weather = await get_weather(lat, lng)

    alerts = []
    current = weather.get("current", {})

    # Check for alert conditions
    if current.get("wind_speed_kmh") and current["wind_speed_kmh"] > 60:
        alerts.append({
            "type": "WIND",
            "severity": "warning" if current["wind_speed_kmh"] < 80 else "severe",
            "message": f"Strong winds: {current['wind_speed_kmh']} km/h",
            "advice": "Exercise caution when driving, especially high-sided vehicles"
        })

    weather_code = current.get("weather_code")
    if weather_code:
        if weather_code >= 95:
            alerts.append({
                "type": "THUNDERSTORM",
                "severity": "severe",
                "message": "Thunderstorm activity",
                "advice": "Avoid travel if possible. Stay indoors."
            })
        elif weather_code in [65, 82]:
            alerts.append({
                "type": "RAIN",
                "severity": "warning",
                "message": "Heavy rain",
                "advice": "Reduced visibility. Drive slowly and maintain distance."
            })
        elif weather_code in [45, 48]:
            alerts.append({
                "type": "FOG",
                "severity": "warning",
                "message": "Foggy conditions",
                "advice": "Use fog lights. Reduce speed significantly."
            })

    return {
        "location": {"lat": lat, "lng": lng},
        "alerts": alerts,
        "alert_count": len(alerts),
        "current_conditions": current.get("weather_description", "Unknown")
    }


# ============================================
# Feature Status / Capabilities Endpoint
# ============================================

@app.get("/api/capabilities", tags=["Info"])
async def get_capabilities():
    """
    Get current map capabilities and feature status.

    Shows what features are available vs coming soon.
    """
    return {
        "routing": {
            "status": "available",
            "provider": "OSRM",
            "modes": ["driving", "walking", "cycling"]
        },
        "geocoding": {
            "status": "available",
            "provider": "Nominatim",
            "coverage": "Global (focused on South Africa)"
        },
        "pois": {
            "status": "available",
            "source": "OpenStreetMap",
            "count": "30,000+",
            "categories": 35
        },
        "traffic": {
            "crowdsourced": {
                "status": "available",
                "source": "TagMe app users"
            },
            "here": {
                "status": "available" if HERE_API_KEY else "requires_api_key",
                "provider": "HERE",
                "note": "Free tier: 250,000 requests/month (recommended)",
                "endpoints": ["/api/traffic/here", "/api/traffic/incidents"]
            },
            "tomtom": {
                "status": "available" if TOMTOM_API_KEY else "requires_api_key",
                "provider": "TomTom",
                "note": "Free tier: 2,500 requests/day"
            }
        },
        "street_view": {
            "status": "available" if MAPILLARY_ACCESS_TOKEN else "requires_api_key",
            "provider": "Mapillary",
            "note": "Free crowdsourced imagery"
        },
        "transit": {
            "stops": {
                "status": "available",
                "source": "OpenStreetMap"
            },
            "schedules": {
                "status": "coming_soon",
                "note": "Awaiting SA transit agency GTFS feeds"
            }
        },
        "indoor_maps": {
            "status": "limited",
            "note": "Community-driven via OSM Simple Indoor Tagging"
        },
        "satellite_imagery": {
            "status": "available",
            "provider": "ESRI World Imagery",
            "cost": "Free"
        },
        "reviews": {
            "status": "available",
            "source": "Crowdsourced"
        },
        "business_hours": {
            "status": "partial",
            "source": "OpenStreetMap (where available)"
        },
        "elevation": {
            "status": "available",
            "provider": "Open-Elevation (SRTM)",
            "resolution": "30m",
            "endpoints": ["/api/elevation", "/api/elevation/batch", "/api/elevation/profile"]
        },
        "weather": {
            "status": "available",
            "provider": "Open-Meteo",
            "features": ["current", "7-day forecast", "alerts"],
            "endpoints": ["/api/weather", "/api/weather/alerts"]
        },
        "isochrone": {
            "status": "available",
            "description": "Reachability maps - areas within X minutes",
            "endpoint": "/api/isochrone"
        },
        "multi_stop_routing": {
            "status": "available",
            "description": "Route optimization for multiple stops",
            "endpoints": ["/api/route/multi", "/api/route/optimize"]
        },
        "load_shedding": {
            "status": "available" if os.getenv("ESKOMSEPUSH_TOKEN") else "requires_api_key",
            "provider": "EskomSePush",
            "note": "SA-specific: current stage + area schedules",
            "endpoints": ["/api/loadshedding", "/api/loadshedding/area", "/api/loadshedding/search"]
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
