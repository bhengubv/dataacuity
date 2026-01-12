"""
SA Transit Data Hub API
Unified transit data for South Africa with GTFS support and crowdsourcing
"""

import os
import json
import logging
from datetime import datetime, date, time, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException, Query, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://maps:maps_secret_2024@localhost:5433/maps")
API_KEY = os.getenv("TRANSIT_API_KEY", "")
MAPS_API_URL = os.getenv("MAPS_API_URL", "http://maps_api:8000")
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://auth.dataacuity.co.za")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "dataacuity")

# Database connection pool
db_pool: Optional[asyncpg.Pool] = None

async def get_db():
    """Get database connection from pool"""
    global db_pool
    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database not available")
    async with db_pool.acquire() as conn:
        yield conn

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
        logger.info("Database connection pool created")
        yield
    finally:
        if db_pool:
            await db_pool.close()
            logger.info("Database connection pool closed")

# Initialize FastAPI app
app = FastAPI(
    title="SA Transit Data Hub",
    description="""
## South African Public Transit API

Unified public transit data for South Africa with GTFS support.

### Features
- **Stops & Stations**: Search for transit stops by location or name
- **Routes**: Get route information and schedules
- **Departures**: Real-time and scheduled departure times
- **Trip Planning**: Plan trips using public transit

### Data Sources
- Gautrain (Gauteng)
- GO GEORGE (Garden Route)
- MyCiTi (Cape Town)
- Stellenbosch Municipality
- Crowdsourced community data

## Authentication

Access via the DataAcuity API Gateway:

### 1. API Key
```
X-API-Key: dak_your_api_key_here
```

### 2. OAuth2/JWT Token
```
Authorization: Bearer <jwt_token>
```

## Gateway Access
Base URL: `https://api.dataacuity.co.za/api/v1/transit/`
""",
    version="1.0.0",
    contact={
        "name": "DataAcuity API Support",
        "email": "api-support@dataacuity.co.za",
    },
    servers=[
        {"url": "https://transit.dataacuity.co.za", "description": "Production"},
        {"url": "https://api.dataacuity.co.za/api/v1/transit", "description": "Via API Gateway"},
        {"url": "http://localhost:5030", "description": "Development"},
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
                    "scopes": {"openid": "OpenID Connect scope", "profile": "Profile", "email": "Email"}
                }
            }
        },
        "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
        "ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
    }
    openapi_schema["security"] = [{"BearerAuth": []}, {"ApiKeyAuth": []}, {"OAuth2": ["openid"]}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Pydantic Models
# ==========================================

class Location(BaseModel):
    lat: float
    lng: float

class StopBase(BaseModel):
    stop_id: str
    stop_name: str
    stop_lat: float
    stop_lon: float
    location_type: int = 0
    amenities: List[str] = []

class RouteBase(BaseModel):
    route_id: str
    route_short_name: Optional[str]
    route_long_name: Optional[str]
    route_type: int
    route_color: Optional[str]
    agency_name: Optional[str]

class TripPlanRequest(BaseModel):
    origin: Location
    destination: Location
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    max_transfers: int = 3
    walk_speed: float = 1.4  # m/s
    max_walk_distance: int = 1000  # meters

class RouteContribution(BaseModel):
    device_id: str
    route_type: str  # 'minibus_taxi', 'bus', etc.
    route_name: Optional[str]
    route_number: Optional[str]
    origin_name: Optional[str]
    destination_name: Optional[str]
    waypoints: List[Location]
    stops: List[Dict[str, Any]] = []
    fare_amount: Optional[float]
    operating_hours: Optional[Dict] = None
    notes: Optional[str]

class StopContribution(BaseModel):
    device_id: str
    stop_name: str
    location: Location
    stop_type: str  # 'taxi_rank', 'bus_stop', etc.
    description: Optional[str]
    amenities: List[str] = []

class VoteRequest(BaseModel):
    device_id: str
    vote_type: int  # 1 or -1

# ==========================================
# Health & Info Endpoints
# ==========================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )

@app.get("/")
async def root():
    """API information"""
    return {
        "name": "SA Transit Data Hub",
        "version": "1.0.0",
        "description": "Unified public transit data for South Africa",
        "endpoints": {
            "agencies": "/api/agencies",
            "routes": "/api/routes",
            "stops": "/api/stops",
            "trips": "/api/trips",
            "plan": "/api/plan",
            "realtime": "/api/realtime",
            "contribute": "/api/contribute",
            "gtfs": "/api/gtfs"
        }
    }

@app.get("/api/stats")
async def get_stats(conn=Depends(get_db)):
    """Get database statistics"""
    stats = {}

    # Count agencies
    stats["agencies"] = await conn.fetchval("SELECT COUNT(*) FROM agencies")

    # Count routes by type
    route_types = await conn.fetch("""
        SELECT route_type, COUNT(*) as count
        FROM routes WHERE is_active = true
        GROUP BY route_type
    """)
    stats["routes"] = {
        "total": sum(r["count"] for r in route_types),
        "by_type": {str(r["route_type"]): r["count"] for r in route_types}
    }

    # Count stops
    stats["stops"] = await conn.fetchval("SELECT COUNT(*) FROM stops")

    # Count trips
    stats["trips"] = await conn.fetchval("SELECT COUNT(*) FROM trips")

    # Data sources
    sources = await conn.fetch("""
        SELECT name, source_type, last_updated
        FROM data_sources
        WHERE is_active = true
    """)
    stats["data_sources"] = [dict(s) for s in sources]

    # Crowdsourcing stats
    stats["contributions"] = {
        "routes": await conn.fetchval("SELECT COUNT(*) FROM route_contributions"),
        "stops": await conn.fetchval("SELECT COUNT(*) FROM stop_contributions"),
        "pending": await conn.fetchval(
            "SELECT COUNT(*) FROM route_contributions WHERE status = 'pending'"
        ),
        "contributors": await conn.fetchval("SELECT COUNT(*) FROM contributors")
    }

    return stats

# ==========================================
# Data Source Endpoints
# ==========================================

@app.get("/api/sources")
async def list_data_sources(
    country: str = Query("ZA", description="Country code"),
    conn=Depends(get_db)
):
    """List all data sources"""
    sources = await conn.fetch("""
        SELECT id, name, source_type, url, last_updated, update_frequency,
               country_code, region, is_active, metadata
        FROM data_sources
        WHERE country_code = $1
        ORDER BY name
    """, country)

    return {"sources": [dict(s) for s in sources]}

# ==========================================
# Agency Endpoints
# ==========================================

@app.get("/api/agencies")
async def list_agencies(
    region: Optional[str] = None,
    conn=Depends(get_db)
):
    """List all transit agencies"""
    if region:
        agencies = await conn.fetch("""
            SELECT a.*, ds.name as source_name
            FROM agencies a
            JOIN data_sources ds ON a.data_source_id = ds.id
            WHERE a.region = $1 AND a.is_active = true
            ORDER BY a.agency_name
        """, region)
    else:
        agencies = await conn.fetch("""
            SELECT a.*, ds.name as source_name
            FROM agencies a
            JOIN data_sources ds ON a.data_source_id = ds.id
            WHERE a.is_active = true
            ORDER BY a.agency_name
        """)

    return {"agencies": [dict(a) for a in agencies]}

@app.get("/api/agencies/{agency_id}")
async def get_agency(agency_id: str, conn=Depends(get_db)):
    """Get agency details"""
    agency = await conn.fetchrow("""
        SELECT a.*, ds.name as source_name,
               ST_AsGeoJSON(a.service_area)::json as service_area_geojson
        FROM agencies a
        JOIN data_sources ds ON a.data_source_id = ds.id
        WHERE a.agency_id = $1
    """, agency_id)

    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")

    return dict(agency)

@app.get("/api/agencies/{agency_id}/routes")
async def get_agency_routes(agency_id: str, conn=Depends(get_db)):
    """Get all routes for an agency"""
    routes = await conn.fetch("""
        SELECT r.*, ST_AsGeoJSON(r.route_geometry)::json as geometry
        FROM routes r
        WHERE r.agency_id = $1 AND r.is_active = true
        ORDER BY r.route_short_name
    """, agency_id)

    return {"routes": [dict(r) for r in routes]}

# ==========================================
# Route Endpoints
# ==========================================

@app.get("/api/routes")
async def list_routes(
    agency_id: Optional[str] = None,
    route_type: Optional[int] = None,
    search: Optional[str] = None,
    bounds: Optional[str] = None,  # "sw_lat,sw_lng,ne_lat,ne_lng"
    limit: int = Query(100, le=500),
    offset: int = 0,
    conn=Depends(get_db)
):
    """List routes with optional filters"""
    conditions = ["r.is_active = true"]
    params = []
    param_count = 0

    if agency_id:
        param_count += 1
        conditions.append(f"r.agency_id = ${param_count}")
        params.append(agency_id)

    if route_type is not None:
        param_count += 1
        conditions.append(f"r.route_type = ${param_count}")
        params.append(route_type)

    if search:
        param_count += 1
        conditions.append(f"""
            (r.route_short_name ILIKE ${param_count} OR
             r.route_long_name ILIKE ${param_count})
        """)
        params.append(f"%{search}%")

    if bounds:
        try:
            sw_lat, sw_lng, ne_lat, ne_lng = map(float, bounds.split(","))
            param_count += 1
            conditions.append(f"""
                ST_Intersects(
                    r.route_geometry,
                    ST_MakeEnvelope(${param_count}, ${param_count + 1}, ${param_count + 2}, ${param_count + 3}, 4326)
                )
            """)
            params.extend([sw_lng, sw_lat, ne_lng, ne_lat])
            param_count += 3
        except:
            pass

    where_clause = " AND ".join(conditions)

    routes = await conn.fetch(f"""
        SELECT r.route_id, r.route_short_name, r.route_long_name,
               r.route_type, r.route_color, r.route_text_color,
               a.agency_name, ds.name as source_name,
               ST_AsGeoJSON(r.route_geometry)::json as geometry
        FROM routes r
        LEFT JOIN agencies a ON r.agency_id = a.agency_id AND r.data_source_id = a.data_source_id
        JOIN data_sources ds ON r.data_source_id = ds.id
        WHERE {where_clause}
        ORDER BY r.route_short_name
        LIMIT ${param_count + 1} OFFSET ${param_count + 2}
    """, *params, limit, offset)

    return {"routes": [dict(r) for r in routes]}

@app.get("/api/routes/{route_id}")
async def get_route(route_id: str, conn=Depends(get_db)):
    """Get route details with stops"""
    route = await conn.fetchrow("""
        SELECT r.*, a.agency_name, ds.name as source_name,
               ST_AsGeoJSON(r.route_geometry)::json as geometry
        FROM routes r
        LEFT JOIN agencies a ON r.agency_id = a.agency_id AND r.data_source_id = a.data_source_id
        JOIN data_sources ds ON r.data_source_id = ds.id
        WHERE r.route_id = $1
    """, route_id)

    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    # Get stops for this route
    stops = await conn.fetch("""
        SELECT DISTINCT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.amenities
        FROM stops s
        JOIN stop_times st ON s.stop_id = st.stop_id AND s.data_source_id = st.data_source_id
        JOIN trips t ON st.trip_id = t.trip_id AND st.data_source_id = t.data_source_id
        WHERE t.route_id = $1
        ORDER BY s.stop_name
    """, route_id)

    result = dict(route)
    result["stops"] = [dict(s) for s in stops]

    return result

@app.get("/api/routes/{route_id}/schedule")
async def get_route_schedule(
    route_id: str,
    date: Optional[str] = None,  # YYYY-MM-DD
    direction_id: Optional[int] = None,
    conn=Depends(get_db)
):
    """Get schedule for a route on a specific date"""
    if date:
        try:
            schedule_date = datetime.strptime(date, "%Y-%m-%d").date()
        except:
            schedule_date = datetime.now().date()
    else:
        schedule_date = datetime.now().date()

    day_name = schedule_date.strftime("%A").lower()

    # Get trips for this route on this day
    query = f"""
        SELECT t.trip_id, t.trip_headsign, t.direction_id,
               st.stop_id, st.arrival_time, st.departure_time, st.stop_sequence,
               s.stop_name
        FROM trips t
        JOIN calendar c ON t.service_id = c.service_id AND t.data_source_id = c.data_source_id
        JOIN stop_times st ON t.trip_id = st.trip_id AND t.data_source_id = st.data_source_id
        JOIN stops s ON st.stop_id = s.stop_id AND st.data_source_id = s.data_source_id
        WHERE t.route_id = $1
          AND c.{day_name} = true
          AND c.start_date <= $2
          AND c.end_date >= $2
    """
    params = [route_id, schedule_date]

    if direction_id is not None:
        query += " AND t.direction_id = $3"
        params.append(direction_id)

    query += " ORDER BY st.departure_time, st.stop_sequence"

    rows = await conn.fetch(query, *params)

    # Group by trip
    trips = {}
    for row in rows:
        trip_id = row["trip_id"]
        if trip_id not in trips:
            trips[trip_id] = {
                "trip_id": trip_id,
                "headsign": row["trip_headsign"],
                "direction_id": row["direction_id"],
                "stops": []
            }
        trips[trip_id]["stops"].append({
            "stop_id": row["stop_id"],
            "stop_name": row["stop_name"],
            "arrival": str(row["arrival_time"]),
            "departure": str(row["departure_time"]),
            "sequence": row["stop_sequence"]
        })

    return {
        "route_id": route_id,
        "date": str(schedule_date),
        "day": day_name,
        "trips": list(trips.values())
    }

# ==========================================
# Stop Endpoints
# ==========================================

@app.get("/api/stops")
async def list_stops(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: int = Query(500, le=5000, description="Radius in meters"),
    search: Optional[str] = None,
    stop_type: Optional[int] = None,
    limit: int = Query(100, le=500),
    conn=Depends(get_db)
):
    """List stops, optionally near a location"""
    if lat is not None and lng is not None:
        # Nearby search
        stops = await conn.fetch("""
            SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
                   s.location_type, s.amenities, s.is_verified,
                   ds.name as source_name,
                   ST_Distance(
                       s.geometry::geography,
                       ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                   ) as distance_meters
            FROM stops s
            JOIN data_sources ds ON s.data_source_id = ds.id
            WHERE ST_DWithin(
                s.geometry::geography,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ORDER BY distance_meters
            LIMIT $4
        """, lat, lng, radius, limit)
    elif search:
        # Text search
        stops = await conn.fetch("""
            SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
                   s.location_type, s.amenities, s.is_verified,
                   ds.name as source_name
            FROM stops s
            JOIN data_sources ds ON s.data_source_id = ds.id
            WHERE s.stop_name ILIKE $1
            ORDER BY s.stop_name
            LIMIT $2
        """, f"%{search}%", limit)
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either lat/lng or search parameter"
        )

    return {"stops": [dict(s) for s in stops]}

@app.get("/api/stops/{stop_id}")
async def get_stop(stop_id: str, conn=Depends(get_db)):
    """Get stop details with routes"""
    stop = await conn.fetchrow("""
        SELECT s.*, ds.name as source_name
        FROM stops s
        JOIN data_sources ds ON s.data_source_id = ds.id
        WHERE s.stop_id = $1
    """, stop_id)

    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")

    # Get routes serving this stop
    routes = await conn.fetch("""
        SELECT DISTINCT r.route_id, r.route_short_name, r.route_long_name,
               r.route_type, r.route_color
        FROM routes r
        JOIN trips t ON r.route_id = t.route_id AND r.data_source_id = t.data_source_id
        JOIN stop_times st ON t.trip_id = st.trip_id AND t.data_source_id = st.data_source_id
        WHERE st.stop_id = $1
        ORDER BY r.route_short_name
    """, stop_id)

    result = dict(stop)
    result["routes"] = [dict(r) for r in routes]

    return result

@app.get("/api/stops/{stop_id}/departures")
async def get_stop_departures(
    stop_id: str,
    date: Optional[str] = None,
    start_time: Optional[str] = None,  # HH:MM
    limit: int = Query(20, le=100),
    conn=Depends(get_db)
):
    """Get upcoming departures from a stop"""
    if date:
        try:
            schedule_date = datetime.strptime(date, "%Y-%m-%d").date()
        except:
            schedule_date = datetime.now().date()
    else:
        schedule_date = datetime.now().date()

    if start_time:
        try:
            start = datetime.strptime(start_time, "%H:%M").time()
        except:
            start = datetime.now().time()
    else:
        start = datetime.now().time()

    day_name = schedule_date.strftime("%A").lower()

    departures = await conn.fetch(f"""
        SELECT st.departure_time, t.trip_headsign, t.direction_id,
               r.route_id, r.route_short_name, r.route_long_name,
               r.route_type, r.route_color
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id AND st.data_source_id = t.data_source_id
        JOIN routes r ON t.route_id = r.route_id AND t.data_source_id = r.data_source_id
        JOIN calendar c ON t.service_id = c.service_id AND t.data_source_id = c.data_source_id
        WHERE st.stop_id = $1
          AND c.{day_name} = true
          AND c.start_date <= $2
          AND c.end_date >= $2
          AND st.departure_time >= $3
        ORDER BY st.departure_time
        LIMIT $4
    """, stop_id, schedule_date, timedelta(hours=start.hour, minutes=start.minute), limit)

    return {
        "stop_id": stop_id,
        "date": str(schedule_date),
        "departures": [{
            "time": str(d["departure_time"]),
            "headsign": d["trip_headsign"],
            "route_id": d["route_id"],
            "route_name": d["route_short_name"] or d["route_long_name"],
            "route_type": d["route_type"],
            "route_color": d["route_color"]
        } for d in departures]
    }

# ==========================================
# Trip Planning Endpoints
# ==========================================

@app.post("/api/plan")
async def plan_trip(request: TripPlanRequest, conn=Depends(get_db)):
    """Plan a transit trip between two points"""
    # Find nearby stops to origin and destination
    origin_stops = await conn.fetch("""
        SELECT stop_id, stop_name, stop_lat, stop_lon,
               ST_Distance(
                   geometry::geography,
                   ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
               ) as distance
        FROM stops
        WHERE ST_DWithin(
            geometry::geography,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            $3
        )
        ORDER BY distance
        LIMIT 5
    """, request.origin.lat, request.origin.lng, request.max_walk_distance)

    dest_stops = await conn.fetch("""
        SELECT stop_id, stop_name, stop_lat, stop_lon,
               ST_Distance(
                   geometry::geography,
                   ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
               ) as distance
        FROM stops
        WHERE ST_DWithin(
            geometry::geography,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            $3
        )
        ORDER BY distance
        LIMIT 5
    """, request.destination.lat, request.destination.lng, request.max_walk_distance)

    if not origin_stops:
        return {
            "success": False,
            "error": "No transit stops found near origin",
            "suggestion": "Try increasing walk distance or use a different starting point"
        }

    if not dest_stops:
        return {
            "success": False,
            "error": "No transit stops found near destination",
            "suggestion": "Try increasing walk distance or use a different destination"
        }

    # Simple route finding - find direct routes first
    departure = request.departure_time or datetime.now()
    day_name = departure.strftime("%A").lower()

    # Try to find direct routes
    for origin_stop in origin_stops:
        for dest_stop in dest_stops:
            direct_routes = await conn.fetch(f"""
                SELECT DISTINCT r.route_id, r.route_short_name, r.route_long_name,
                       r.route_type, r.route_color,
                       st1.departure_time as board_time,
                       st2.arrival_time as alight_time,
                       t.trip_headsign
                FROM routes r
                JOIN trips t ON r.route_id = t.route_id AND r.data_source_id = t.data_source_id
                JOIN calendar c ON t.service_id = c.service_id AND t.data_source_id = c.data_source_id
                JOIN stop_times st1 ON t.trip_id = st1.trip_id AND t.data_source_id = st1.data_source_id
                JOIN stop_times st2 ON t.trip_id = st2.trip_id AND t.data_source_id = st2.data_source_id
                WHERE st1.stop_id = $1
                  AND st2.stop_id = $2
                  AND st1.stop_sequence < st2.stop_sequence
                  AND c.{day_name} = true
                  AND st1.departure_time >= $3
                ORDER BY st1.departure_time
                LIMIT 5
            """, origin_stop["stop_id"], dest_stop["stop_id"],
                timedelta(hours=departure.hour, minutes=departure.minute))

            if direct_routes:
                return {
                    "success": True,
                    "itineraries": [{
                        "legs": [
                            {
                                "type": "walk",
                                "from": {"lat": request.origin.lat, "lng": request.origin.lng},
                                "to": {
                                    "stop_id": origin_stop["stop_id"],
                                    "name": origin_stop["stop_name"],
                                    "lat": origin_stop["stop_lat"],
                                    "lng": origin_stop["stop_lon"]
                                },
                                "distance_meters": int(origin_stop["distance"]),
                                "duration_seconds": int(origin_stop["distance"] / request.walk_speed)
                            },
                            {
                                "type": "transit",
                                "route_id": r["route_id"],
                                "route_name": r["route_short_name"] or r["route_long_name"],
                                "route_type": r["route_type"],
                                "route_color": r["route_color"],
                                "headsign": r["trip_headsign"],
                                "board_stop": origin_stop["stop_name"],
                                "alight_stop": dest_stop["stop_name"],
                                "board_time": str(r["board_time"]),
                                "alight_time": str(r["alight_time"])
                            },
                            {
                                "type": "walk",
                                "from": {
                                    "stop_id": dest_stop["stop_id"],
                                    "name": dest_stop["stop_name"],
                                    "lat": dest_stop["stop_lat"],
                                    "lng": dest_stop["stop_lon"]
                                },
                                "to": {"lat": request.destination.lat, "lng": request.destination.lng},
                                "distance_meters": int(dest_stop["distance"]),
                                "duration_seconds": int(dest_stop["distance"] / request.walk_speed)
                            }
                        ],
                        "transfers": 0
                    } for r in direct_routes]
                }

    # No direct routes found
    return {
        "success": False,
        "error": "No direct routes found",
        "nearby_origin_stops": [dict(s) for s in origin_stops],
        "nearby_dest_stops": [dict(s) for s in dest_stops],
        "suggestion": "Multi-leg routing with transfers coming soon"
    }

# ==========================================
# Real-time Data Endpoints
# ==========================================

@app.get("/api/realtime/vehicles")
async def get_vehicle_positions(
    route_id: Optional[str] = None,
    bounds: Optional[str] = None,
    conn=Depends(get_db)
):
    """Get real-time vehicle positions"""
    conditions = ["timestamp > NOW() - INTERVAL '5 minutes'"]
    params = []
    param_count = 0

    if route_id:
        param_count += 1
        conditions.append(f"route_id = ${param_count}")
        params.append(route_id)

    if bounds:
        try:
            sw_lat, sw_lng, ne_lat, ne_lng = map(float, bounds.split(","))
            param_count += 1
            conditions.append(f"""
                ST_Within(
                    position,
                    ST_MakeEnvelope(${param_count}, ${param_count + 1}, ${param_count + 2}, ${param_count + 3}, 4326)
                )
            """)
            params.extend([sw_lng, sw_lat, ne_lng, ne_lat])
        except:
            pass

    where_clause = " AND ".join(conditions)

    vehicles = await conn.fetch(f"""
        SELECT vehicle_id, trip_id, route_id,
               ST_Y(position) as lat, ST_X(position) as lng,
               bearing, speed, current_status, timestamp
        FROM vehicle_positions
        WHERE {where_clause}
        ORDER BY timestamp DESC
    """, *params)

    return {"vehicles": [dict(v) for v in vehicles]}

@app.get("/api/realtime/alerts")
async def get_service_alerts(
    route_id: Optional[str] = None,
    agency_id: Optional[str] = None,
    conn=Depends(get_db)
):
    """Get active service alerts"""
    alerts = await conn.fetch("""
        SELECT alert_id, cause, effect, header_text, description_text,
               severity_level, active_period_start, active_period_end,
               affected_routes, affected_stops
        FROM service_alerts
        WHERE is_active = true
          AND (active_period_end IS NULL OR active_period_end > NOW())
        ORDER BY severity_level DESC, created_at DESC
    """)

    result = [dict(a) for a in alerts]

    # Filter by route if specified
    if route_id:
        result = [a for a in result if route_id in (a.get("affected_routes") or [])]

    return {"alerts": result}

# ==========================================
# Crowdsourcing Endpoints
# ==========================================

async def get_or_create_contributor(device_id: str, conn) -> int:
    """Get or create a contributor by device ID"""
    contributor = await conn.fetchrow(
        "SELECT id FROM contributors WHERE device_id = $1",
        device_id
    )

    if contributor:
        return contributor["id"]

    # Create new contributor
    new_id = await conn.fetchval("""
        INSERT INTO contributors (device_id, first_contribution, last_contribution)
        VALUES ($1, NOW(), NOW())
        RETURNING id
    """, device_id)

    return new_id

@app.post("/api/contribute/route")
async def contribute_route(contribution: RouteContribution, conn=Depends(get_db)):
    """Submit a crowdsourced route contribution"""
    contributor_id = await get_or_create_contributor(contribution.device_id, conn)

    # Convert waypoints to LineString
    if len(contribution.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints required")

    points = ", ".join([f"{w.lng} {w.lat}" for w in contribution.waypoints])
    linestring = f"LINESTRING({points})"

    # Insert contribution
    contribution_id = await conn.fetchval("""
        INSERT INTO route_contributions (
            contributor_id, route_type, route_name, route_number,
            origin_name, destination_name, waypoints, stops,
            fare_amount, operating_hours, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326), $8, $9, $10, $11)
        RETURNING id
    """, contributor_id, contribution.route_type, contribution.route_name,
        contribution.route_number, contribution.origin_name, contribution.destination_name,
        linestring, json.dumps(contribution.stops), contribution.fare_amount,
        json.dumps(contribution.operating_hours) if contribution.operating_hours else None,
        contribution.notes)

    # Update contributor stats
    await conn.execute("""
        UPDATE contributors
        SET contributions_count = contributions_count + 1,
            last_contribution = NOW()
        WHERE id = $1
    """, contributor_id)

    return {
        "success": True,
        "contribution_id": contribution_id,
        "message": "Route contribution submitted for review"
    }

@app.post("/api/contribute/stop")
async def contribute_stop(contribution: StopContribution, conn=Depends(get_db)):
    """Submit a crowdsourced stop contribution"""
    contributor_id = await get_or_create_contributor(contribution.device_id, conn)

    contribution_id = await conn.fetchval("""
        INSERT INTO stop_contributions (
            contributor_id, stop_name, location, stop_type,
            description, amenities
        ) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7)
        RETURNING id
    """, contributor_id, contribution.stop_name,
        contribution.location.lng, contribution.location.lat,
        contribution.stop_type, contribution.description,
        json.dumps(contribution.amenities))

    # Update contributor stats
    await conn.execute("""
        UPDATE contributors
        SET contributions_count = contributions_count + 1,
            last_contribution = NOW()
        WHERE id = $1
    """, contributor_id)

    return {
        "success": True,
        "contribution_id": contribution_id,
        "message": "Stop contribution submitted for review"
    }

@app.get("/api/contribute/pending")
async def get_pending_contributions(
    contribution_type: str = Query("route", regex="^(route|stop)$"),
    limit: int = Query(50, le=200),
    conn=Depends(get_db)
):
    """Get pending contributions for review"""
    if contribution_type == "route":
        contributions = await conn.fetch("""
            SELECT rc.id, rc.route_type, rc.route_name, rc.route_number,
                   rc.origin_name, rc.destination_name, rc.fare_amount,
                   rc.upvotes, rc.downvotes, rc.verification_count,
                   ST_AsGeoJSON(rc.waypoints)::json as geometry,
                   c.display_name as contributor_name, c.reputation_score,
                   rc.created_at
            FROM route_contributions rc
            JOIN contributors c ON rc.contributor_id = c.id
            WHERE rc.status = 'pending'
            ORDER BY rc.verification_count DESC, rc.upvotes - rc.downvotes DESC
            LIMIT $1
        """, limit)
    else:
        contributions = await conn.fetch("""
            SELECT sc.id, sc.stop_name, sc.stop_type, sc.description,
                   sc.amenities, sc.upvotes, sc.downvotes,
                   ST_Y(sc.location) as lat, ST_X(sc.location) as lng,
                   c.display_name as contributor_name, c.reputation_score,
                   sc.created_at
            FROM stop_contributions sc
            JOIN contributors c ON sc.contributor_id = c.id
            WHERE sc.status = 'pending'
            ORDER BY sc.upvotes - sc.downvotes DESC
            LIMIT $1
        """, limit)

    return {"contributions": [dict(c) for c in contributions]}

@app.post("/api/contribute/route/{contribution_id}/vote")
async def vote_route_contribution(
    contribution_id: int,
    vote: VoteRequest,
    conn=Depends(get_db)
):
    """Vote on a route contribution"""
    if vote.vote_type not in [1, -1]:
        raise HTTPException(status_code=400, detail="vote_type must be 1 or -1")

    contributor_id = await get_or_create_contributor(vote.device_id, conn)

    # Check if already voted
    existing = await conn.fetchrow("""
        SELECT id, vote_type FROM contribution_votes
        WHERE contributor_id = $1 AND route_contribution_id = $2
    """, contributor_id, contribution_id)

    if existing:
        if existing["vote_type"] == vote.vote_type:
            return {"message": "Vote already recorded"}

        # Change vote
        await conn.execute("""
            UPDATE contribution_votes SET vote_type = $1
            WHERE id = $2
        """, vote.vote_type, existing["id"])

        # Update counts
        if vote.vote_type == 1:
            await conn.execute("""
                UPDATE route_contributions
                SET upvotes = upvotes + 1, downvotes = downvotes - 1
                WHERE id = $1
            """, contribution_id)
        else:
            await conn.execute("""
                UPDATE route_contributions
                SET upvotes = upvotes - 1, downvotes = downvotes + 1
                WHERE id = $1
            """, contribution_id)
    else:
        # New vote
        await conn.execute("""
            INSERT INTO contribution_votes (contributor_id, route_contribution_id, vote_type)
            VALUES ($1, $2, $3)
        """, contributor_id, contribution_id, vote.vote_type)

        if vote.vote_type == 1:
            await conn.execute(
                "UPDATE route_contributions SET upvotes = upvotes + 1 WHERE id = $1",
                contribution_id
            )
        else:
            await conn.execute(
                "UPDATE route_contributions SET downvotes = downvotes + 1 WHERE id = $1",
                contribution_id
            )

    return {"success": True, "message": "Vote recorded"}

@app.get("/api/contribute/leaderboard")
async def get_contributor_leaderboard(
    limit: int = Query(50, le=100),
    conn=Depends(get_db)
):
    """Get top contributors"""
    leaders = await conn.fetch("""
        SELECT display_name, reputation_score, contributions_count,
               verified_contributions, is_trusted,
               RANK() OVER (ORDER BY reputation_score DESC) as rank
        FROM contributors
        WHERE is_banned = false AND contributions_count > 0
        ORDER BY reputation_score DESC
        LIMIT $1
    """, limit)

    return {"leaderboard": [dict(l) for l in leaders]}

# ==========================================
# GTFS Export Endpoints
# ==========================================

@app.get("/api/gtfs/export")
async def export_gtfs(
    source_id: Optional[int] = None,
    conn=Depends(get_db)
):
    """Export data as GTFS feed (returns download info)"""
    # In a real implementation, this would generate a ZIP file
    return {
        "message": "GTFS export endpoint",
        "status": "not_implemented",
        "suggestion": "Use /api/gtfs/export/{source_id} for specific sources"
    }

@app.get("/api/gtfs/feed-info")
async def get_feed_info(
    source_id: Optional[int] = None,
    conn=Depends(get_db)
):
    """Get GTFS feed information"""
    if source_id:
        info = await conn.fetchrow("""
            SELECT fi.*, ds.name as source_name
            FROM feed_info fi
            JOIN data_sources ds ON fi.data_source_id = ds.id
            WHERE fi.data_source_id = $1
        """, source_id)
        return dict(info) if info else {"error": "Feed info not found"}

    feeds = await conn.fetch("""
        SELECT fi.*, ds.name as source_name
        FROM feed_info fi
        JOIN data_sources ds ON fi.data_source_id = ds.id
    """)

    return {"feeds": [dict(f) for f in feeds]}

# ==========================================
# Admin Endpoints (protected)
# ==========================================

def verify_admin_key(api_key: str = Query(..., alias="key")):
    """Verify admin API key"""
    if not API_KEY or api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True

@app.post("/api/admin/verify-contribution/{contribution_id}")
async def verify_contribution(
    contribution_id: int,
    contribution_type: str = Query("route", regex="^(route|stop)$"),
    action: str = Query(..., regex="^(approve|reject)$"),
    reason: Optional[str] = None,
    _=Depends(verify_admin_key),
    conn=Depends(get_db)
):
    """Verify or reject a contribution (admin only)"""
    if contribution_type == "route":
        table = "route_contributions"
    else:
        table = "stop_contributions"

    if action == "approve":
        await conn.execute(f"""
            UPDATE {table} SET status = 'verified', verified_at = NOW()
            WHERE id = $1
        """, contribution_id)

        # Update contributor reputation
        await conn.execute("""
            UPDATE contributors SET
                reputation_score = reputation_score + 10,
                verified_contributions = verified_contributions + 1
            WHERE id = (SELECT contributor_id FROM route_contributions WHERE id = $1)
        """, contribution_id)
    else:
        await conn.execute(f"""
            UPDATE {table} SET status = 'rejected', rejection_reason = $2
            WHERE id = $1
        """, contribution_id, reason)

    return {"success": True, "action": action}

@app.post("/api/admin/import-gtfs")
async def trigger_gtfs_import(
    source_id: int,
    url: str,
    background_tasks: BackgroundTasks,
    _=Depends(verify_admin_key),
    conn=Depends(get_db)
):
    """Trigger a GTFS import (admin only)"""
    # Verify source exists
    source = await conn.fetchrow(
        "SELECT id, name FROM data_sources WHERE id = $1",
        source_id
    )

    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")

    # In a real implementation, this would trigger a background import
    return {
        "message": f"GTFS import triggered for {source['name']}",
        "source_id": source_id,
        "url": url,
        "status": "queued"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
