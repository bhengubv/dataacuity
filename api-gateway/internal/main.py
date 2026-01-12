"""
Data Acuity Internal API Gateway
For service-to-service communication within the Data Acuity platform

Features:
- Service mesh authentication (service tokens)
- No rate limiting by default (trusted internal services)
- Service discovery and health aggregation
- Request tracing and correlation IDs
- Internal API versioning
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

import sys
sys.path.insert(0, "/home/geektrading/api-gateway")

from shared import (
    InternalSettings,
    SERVICE_REGISTRY,
    init_db,
    close_db,
    get_db,
    validate_service_token,
    get_client_ip,
    check_service_access,
)

# Configuration
settings = InternalSettings()

# Logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("internal-gateway")

# Prometheus metrics
REQUEST_COUNT = Counter(
    "internal_gateway_requests_total",
    "Total internal gateway requests",
    ["service", "method", "status"],
)
REQUEST_LATENCY = Histogram(
    "internal_gateway_request_duration_seconds",
    "Request latency in seconds",
    ["service", "method"],
)
SERVICE_HEALTH = Counter(
    "internal_gateway_service_health_checks_total",
    "Service health check results",
    ["service", "status"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("Starting Internal API Gateway...")
    await init_db()
    yield
    logger.info("Shutting down Internal API Gateway...")
    await close_db()


app = FastAPI(
    title="Data Acuity Internal API Gateway",
    description="Internal service mesh gateway for Data Acuity platform",
    version=settings.gateway_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS - more permissive for internal services
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP client for proxying requests
http_client = httpx.AsyncClient(timeout=30.0)


# ============================================================================
# Middleware
# ============================================================================


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    """Add correlation ID for request tracing"""
    correlation_id = request.headers.get("X-Correlation-ID")
    if not correlation_id:
        correlation_id = str(uuid.uuid4())

    request.state.correlation_id = correlation_id

    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-Gateway"] = "internal"
    response.headers["X-Gateway-Version"] = settings.gateway_version

    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests"""
    start_time = datetime.utcnow()

    response = await call_next(request)

    duration = (datetime.utcnow() - start_time).total_seconds()
    logger.info(
        f"{request.method} {request.url.path} - {response.status_code} - {duration:.3f}s - "
        f"correlation_id={getattr(request.state, 'correlation_id', 'unknown')}"
    )

    return response


# ============================================================================
# Health and Discovery Endpoints
# ============================================================================


@app.get("/")
async def root():
    """Gateway root endpoint"""
    return {
        "gateway": "internal",
        "version": settings.gateway_version,
        "environment": settings.environment.value,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
async def health():
    """Gateway health check"""
    return {"status": "healthy", "gateway": "internal"}


@app.get("/health/services")
async def service_health():
    """Check health of all registered services"""
    results = {}

    for service_name, config in SERVICE_REGISTRY.items():
        try:
            url = f"{config['url']}{config['health']}"
            response = await http_client.get(url, timeout=5.0)
            healthy = response.status_code < 400
            results[service_name] = {
                "status": "healthy" if healthy else "unhealthy",
                "response_code": response.status_code,
                "url": config["url"],
            }
            SERVICE_HEALTH.labels(service=service_name, status="healthy" if healthy else "unhealthy").inc()
        except Exception as e:
            results[service_name] = {
                "status": "unreachable",
                "error": str(e),
                "url": config["url"],
            }
            SERVICE_HEALTH.labels(service=service_name, status="unreachable").inc()

    all_healthy = all(s["status"] == "healthy" for s in results.values())

    return {
        "overall_status": "healthy" if all_healthy else "degraded",
        "services": results,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/services")
async def list_services():
    """List all registered services"""
    services = {}
    for name, config in SERVICE_REGISTRY.items():
        services[name] = {
            "prefix": config["prefix"],
            "description": config["description"],
            "auth_required": config["auth_required"],
        }
    return {"services": services}


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ============================================================================
# Authentication Dependency
# ============================================================================


async def verify_service_token(
    request: Request,
    x_service_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify internal service token.
    For internal gateway, we can optionally enforce service tokens.
    """
    if not settings.service_mesh_enabled:
        return None

    if not x_service_token:
        # Check if request is from trusted internal network
        client_ip = get_client_ip(request)
        if client_ip.startswith(("10.", "172.", "192.168.", "127.")):
            return None
        raise HTTPException(status_code=401, detail="Service token required")

    service_token = await validate_service_token(db, x_service_token)
    if not service_token:
        raise HTTPException(status_code=401, detail="Invalid service token")

    return service_token


# ============================================================================
# API Versioning
# ============================================================================


def get_api_version(request: Request) -> str:
    """Extract API version from request"""
    # Check header first
    version = request.headers.get("X-API-Version")
    if version and version in settings.supported_versions:
        return version

    # Check path
    path = request.url.path
    for v in settings.supported_versions:
        if f"/{v}/" in path:
            return v

    return settings.default_api_version


# ============================================================================
# Proxy Routes - Internal Service Access
# ============================================================================


@app.api_route(
    "/api/{version}/{service}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def proxy_to_service(
    request: Request,
    version: str,
    service: str,
    path: str,
    service_token=Depends(verify_service_token),
):
    """
    Proxy requests to internal services.
    Path format: /api/v1/{service}/{path}
    """
    # Validate version
    if version not in settings.supported_versions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported API version: {version}. Supported: {settings.supported_versions}",
        )

    # Validate service
    if service not in SERVICE_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown service: {service}. Available: {list(SERVICE_REGISTRY.keys())}",
        )

    # Check service access if using service token
    if service_token and not check_service_access(
        service, service_token.allowed_target_services
    ):
        raise HTTPException(
            status_code=403, detail=f"Service token not authorized for {service}"
        )

    config = SERVICE_REGISTRY[service]
    target_url = f"{config['url']}/{path}"

    # Add query string
    if request.url.query:
        target_url += f"?{request.url.query}"

    # Prepare headers
    headers = dict(request.headers)
    headers.pop("host", None)
    headers["X-Forwarded-For"] = get_client_ip(request)
    headers["X-Correlation-ID"] = getattr(request.state, "correlation_id", str(uuid.uuid4()))
    headers["X-Gateway"] = "internal"
    headers["X-API-Version"] = version

    # Get request body
    body = await request.body()

    # Track metrics
    with REQUEST_LATENCY.labels(service=service, method=request.method).time():
        try:
            response = await http_client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )

            REQUEST_COUNT.labels(
                service=service, method=request.method, status=response.status_code
            ).inc()

            # Return response
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type"),
            )

        except httpx.RequestError as e:
            REQUEST_COUNT.labels(
                service=service, method=request.method, status=502
            ).inc()
            logger.error(f"Error proxying to {service}: {e}")
            raise HTTPException(status_code=502, detail=f"Service unavailable: {service}")


# ============================================================================
# Direct Service Endpoints (Convenience)
# ============================================================================


@app.get("/api/v1/{service}")
async def service_info(service: str):
    """Get information about a specific service"""
    if service not in SERVICE_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service}")

    config = SERVICE_REGISTRY[service]
    return {
        "service": service,
        "description": config["description"],
        "prefix": config["prefix"],
        "auth_required": config["auth_required"],
    }


# ============================================================================
# Service Token Management (Admin)
# ============================================================================


@app.post("/admin/tokens")
async def create_service_token(
    service_name: str,
    description: str = "",
    allowed_services: list[str] = None,
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """Create a new service token (admin only)"""
    from shared import ServiceToken, generate_api_key, hash_key

    # Generate token
    token, token_hash = generate_api_key(prefix="dst_")  # Data Service Token

    new_token = ServiceToken(
        token_hash=token_hash,
        service_name=service_name,
        description=description,
        allowed_target_services=allowed_services or [],
        is_active=True,
    )

    db.add(new_token)
    await db.commit()

    return {
        "token": token,  # Only shown once!
        "service_name": service_name,
        "message": "Save this token securely. It will not be shown again.",
    }


# ============================================================================
# Internal App Credentials Management
# ============================================================================


@app.get("/admin/apps", tags=["App Management"])
async def list_internal_apps(
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """List all registered internal applications"""
    from shared import InternalApp
    from sqlalchemy import select

    result = await db.execute(select(InternalApp).order_by(InternalApp.app_id))
    apps = result.scalars().all()

    return {
        "apps": [
            {
                "id": str(app.id),
                "app_id": app.app_id,
                "name": app.name,
                "description": app.description,
                "app_type": app.app_type,
                "team": app.team,
                "environment": app.environment,
                "is_active": app.is_active,
                "created_at": app.created_at.isoformat() if app.created_at else None,
                "last_used_at": app.last_used_at.isoformat() if app.last_used_at else None,
                "total_requests": app.total_requests,
            }
            for app in apps
        ]
    }


@app.post("/admin/apps", tags=["App Management"])
async def register_internal_app(
    app_id: str,
    name: str,
    app_type: str,
    description: str = "",
    team: str = "",
    owner_email: str = "",
    environment: str = "production",
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """
    Register a new internal application.
    Returns the app_secret which is only shown once!
    """
    from shared import create_app, AppType, get_app_by_id

    # Check if app already exists
    existing = await get_app_by_id(db, app_id)
    if existing:
        raise HTTPException(status_code=400, detail=f"App '{app_id}' already exists")

    # Validate app_type
    try:
        app_type_enum = AppType(app_type)
    except ValueError:
        valid_types = [t.value for t in AppType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid app_type. Valid types: {valid_types}"
        )

    app, app_secret = await create_app(
        db=db,
        app_id=app_id,
        name=name,
        app_type=app_type_enum,
        description=description,
        team=team,
        owner_email=owner_email,
        environment=environment,
    )

    return {
        "app_id": app.app_id,
        "app_secret": app_secret,  # Only shown once!
        "name": app.name,
        "app_type": app.app_type,
        "message": "Save the app_secret securely. It will not be shown again.",
        "usage": {
            "header": "X-App-ID",
            "secret_header": "X-App-Secret",
            "example": f"curl -H 'X-App-ID: {app_id}' -H 'X-App-Secret: {app_secret}' https://api.dataacuity.co.za/..."
        }
    }


@app.post("/admin/apps/{app_id}/regenerate-secret", tags=["App Management"])
async def regenerate_internal_app_secret(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """Regenerate the secret for an internal app"""
    from shared import regenerate_app_secret

    new_secret = await regenerate_app_secret(db, app_id)
    if not new_secret:
        raise HTTPException(status_code=404, detail=f"App '{app_id}' not found")

    return {
        "app_id": app_id,
        "app_secret": new_secret,
        "message": "Save the new app_secret securely. It will not be shown again.",
    }


@app.delete("/admin/apps/{app_id}", tags=["App Management"])
async def deactivate_internal_app(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """Deactivate an internal app (soft delete)"""
    from shared import get_app_by_id

    app = await get_app_by_id(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail=f"App '{app_id}' not found")

    app.is_active = False
    await db.commit()

    return {"message": f"App '{app_id}' has been deactivated"}


@app.get("/admin/apps/{app_id}/usage", tags=["App Management"])
async def get_app_usage(
    app_id: str,
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """Get usage statistics for a specific app"""
    from shared import get_app_usage_stats, get_app_by_id

    app = await get_app_by_id(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail=f"App '{app_id}' not found")

    stats = await get_app_usage_stats(db, app_id=app_id, hours=hours)

    return {
        "app_id": app_id,
        "app_name": app.name,
        "period_hours": hours,
        "stats": stats[0] if stats else {
            "total_requests": 0,
            "avg_response_time_ms": 0,
            "error_count": 0,
        },
    }


@app.get("/admin/apps/usage/summary", tags=["App Management"])
async def get_all_apps_usage(
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """Get usage statistics for all apps"""
    from shared import get_app_usage_stats

    stats = await get_app_usage_stats(db, hours=hours)

    return {
        "period_hours": hours,
        "apps": stats,
    }


@app.post("/admin/apps/init-predefined", tags=["App Management"])
async def init_predefined_apps(
    db: AsyncSession = Depends(get_db),
    service_token=Depends(verify_service_token),
):
    """
    Initialize predefined internal apps.
    Creates credentials for standard Data Acuity applications.
    Returns secrets for new apps only (existing apps are skipped).
    """
    from shared import PREDEFINED_APPS, create_app, get_app_by_id, AppType

    created_apps = []
    skipped_apps = []

    for app_def in PREDEFINED_APPS:
        existing = await get_app_by_id(db, app_def["app_id"])
        if existing:
            skipped_apps.append(app_def["app_id"])
            continue

        app, app_secret = await create_app(
            db=db,
            app_id=app_def["app_id"],
            name=app_def["name"],
            app_type=app_def["app_type"],
            description=app_def.get("description", ""),
            team=app_def.get("team", ""),
        )

        created_apps.append({
            "app_id": app.app_id,
            "name": app.name,
            "app_secret": app_secret,
        })

    return {
        "created": created_apps,
        "skipped": skipped_apps,
        "message": "Save the app_secrets securely. They will not be shown again.",
    }


# ============================================================================
# Application Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=settings.debug,
    )
