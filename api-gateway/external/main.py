"""
Data Acuity External API Gateway
For external client integrations with full security, rate limiting, and quota management

Features:
- OAuth2/JWT authentication via Keycloak
- API key authentication for programmatic access
- Per-plan rate limiting and quotas
- Usage tracking and analytics
- API versioning with deprecation support
- OpenAPI documentation aggregation
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Header, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

import sys
sys.path.insert(0, "/home/geektrading/api-gateway")

from shared import (
    ExternalSettings,
    SERVICE_REGISTRY,
    PLAN_QUOTAS,
    COMPANY_APP_WHITELIST,
    init_db,
    close_db,
    get_db,
    validate_api_key,
    get_client_ip,
    check_scope,
    check_service_access,
    is_company_app_ip,
    KeycloakValidator,
    api_key_header,
    bearer_scheme,
    ApiKey,
    ApiUsage,
    QuotaUsage,
    RateLimitViolation,
    rate_limiter,
    # App credentials for internal app tracking
    validate_app_credentials,
    log_app_usage,
    InternalApp,
)

# Configuration
settings = ExternalSettings()

# Logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("external-gateway")

# Keycloak validator
keycloak_validator = KeycloakValidator(settings)

# Prometheus metrics
REQUEST_COUNT = Counter(
    "external_gateway_requests_total",
    "Total external gateway requests",
    ["service", "method", "status", "auth_type"],
)
REQUEST_LATENCY = Histogram(
    "external_gateway_request_duration_seconds",
    "Request latency in seconds",
    ["service", "method"],
)
RATE_LIMIT_HITS = Counter(
    "external_gateway_rate_limit_hits_total",
    "Rate limit violations",
    ["service", "limit_type"],
)
ACTIVE_KEYS = Gauge(
    "external_gateway_active_api_keys",
    "Number of active API keys",
)
APP_REQUEST_COUNT = Counter(
    "external_gateway_app_requests_total",
    "Total requests by internal app",
    ["app_id", "app_type", "service", "status"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("Starting External API Gateway...")
    await init_db()
    await rate_limiter.connect()
    yield
    logger.info("Shutting down External API Gateway...")
    await rate_limiter.close()
    await close_db()


app = FastAPI(
    title="Data Acuity External API Gateway",
    description="""
# Data Acuity API

Welcome to the Data Acuity API Gateway. This gateway provides unified access to all Data Acuity services.

## Authentication

Two authentication methods are supported:

### 1. API Key (Recommended for applications)
Include your API key in the `X-API-Key` header:
```
X-API-Key: dak_your_api_key_here
```

### 2. OAuth2/JWT (For user sessions)
Include a valid JWT token from Keycloak in the Authorization header:
```
Authorization: Bearer your_jwt_token
```

## Internal App Tracking

For internal Data Acuity applications, include app credentials to track usage per app:
```
X-App-ID: markets-dashboard
X-App-Secret: das_your_app_secret_here
```

This allows us to:
- Track which internal app made each API call
- Generate per-app usage analytics
- Identify traffic patterns by application

Contact the platform team to register your internal app and receive credentials.

## Rate Limiting

Rate limits are enforced per API key/user based on your subscription plan:
- **Free**: 100 requests/minute
- **Starter**: 200 requests/minute
- **Growth**: 500 requests/minute
- **Enterprise**: 1000 requests/minute

*Note: Company whitelist IPs and internal apps bypass rate limiting.*

## Versioning

API versions are specified in the URL path: `/api/v1/...`

Current version: v1
""",
    version=settings.gateway_version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    servers=[
        {"url": f"https://{settings.domain}/api", "description": "Production"},
        {"url": "http://localhost:8081", "description": "Development"},
    ],
)

# CORS - configured for external access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Quota-Remaining"],
)

# HTTP client for proxying requests
http_client = httpx.AsyncClient(timeout=30.0)

# Include ingest router for TGN data ingestion
from external.ingest import router as ingest_router
app.include_router(ingest_router)


# ============================================================================
# Middleware
# ============================================================================


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID for tracing"""
    request_id = request.headers.get("X-Request-ID")
    if not request_id:
        request_id = str(uuid.uuid4())

    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Gateway"] = "external"
    response.headers["X-Gateway-Version"] = settings.gateway_version

    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    return response


# ============================================================================
# Authentication Dependencies
# ============================================================================


class AuthResult:
    """Authentication result container"""

    def __init__(
        self,
        authenticated: bool,
        auth_type: str,
        user_id: Optional[str] = None,
        email: Optional[str] = None,
        plan_id: str = "free",
        api_key: Optional[ApiKey] = None,
        scopes: list = None,
        allowed_services: list = None,
        is_company_app: bool = False,
        # Internal app tracking
        internal_app: Optional[InternalApp] = None,
        app_id: Optional[str] = None,
        app_name: Optional[str] = None,
        app_type: Optional[str] = None,
    ):
        self.authenticated = authenticated
        self.auth_type = auth_type
        self.user_id = user_id
        self.email = email
        self.plan_id = plan_id
        self.api_key = api_key
        self.scopes = scopes or []
        self.allowed_services = allowed_services or []
        self.is_company_app = is_company_app  # Company whitelist IPs get special treatment
        # Internal app identification
        self.internal_app = internal_app
        self.app_id = app_id
        self.app_name = app_name
        self.app_type = app_type


async def authenticate(
    request: Request,
    api_key: Optional[str] = Security(api_key_header),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> AuthResult:
    """
    Authenticate request using API key, JWT token, or company IP whitelist.
    Returns AuthResult with authentication details.

    Also checks for internal app credentials (X-App-ID, X-App-Secret) to track
    which internal application made the API call.

    Company app whitelist IPs receive:
    - Automatic authentication as "company_app"
    - Enterprise plan privileges (no rate limits, no quotas)
    - Full access to all services
    """
    client_ip = get_client_ip(request)

    # Check for internal app credentials (X-App-ID and X-App-Secret headers)
    # These identify which internal app is making the call
    app_id = request.headers.get("X-App-ID")
    app_secret = request.headers.get("X-App-Secret")
    internal_app = None

    if app_id and app_secret:
        internal_app = await validate_app_credentials(db, app_id, app_secret)
        if internal_app:
            logger.info(f"Internal app authenticated: {app_id} ({internal_app.name})")
        else:
            logger.warning(f"Invalid app credentials for app_id: {app_id}")

    # Check if request is from company app whitelist
    # These IPs get automatic enterprise-level access
    if is_company_app_ip(client_ip):
        logger.info(f"Company app request from whitelisted IP: {client_ip}")
        return AuthResult(
            authenticated=True,
            auth_type="company_whitelist",
            user_id=f"company_app_{client_ip}",
            email="apps@dataacuity.co.za",
            plan_id="enterprise",  # Enterprise = no limits
            scopes=["*"],  # Full access
            allowed_services=[],  # Empty = all services
            is_company_app=True,
            # Include app info if provided
            internal_app=internal_app,
            app_id=internal_app.app_id if internal_app else app_id,
            app_name=internal_app.name if internal_app else None,
            app_type=internal_app.app_type if internal_app else None,
        )

    # Try API key
    if api_key:
        key = await validate_api_key(db, api_key, request)
        if key:
            return AuthResult(
                authenticated=True,
                auth_type="api_key",
                user_id=key.user_id,
                email=key.email,
                plan_id=key.plan_id,
                api_key=key,
                scopes=key.scopes or [],
                allowed_services=key.allowed_services or [],
                # Include app info if provided
                internal_app=internal_app,
                app_id=internal_app.app_id if internal_app else app_id,
                app_name=internal_app.name if internal_app else None,
                app_type=internal_app.app_type if internal_app else None,
            )

    # Try JWT token
    if bearer_token:
        try:
            claims = await keycloak_validator.validate_token(bearer_token.credentials)
            # Extract source_app from JWT claims if present (set by Keycloak client mappers)
            jwt_source_app = claims.get("source_app")
            jwt_client_id = claims.get("azp")  # Authorized party (client_id)

            # Log JWT-based app identification
            if jwt_source_app or jwt_client_id:
                logger.info(f"JWT auth from source_app={jwt_source_app}, client_id={jwt_client_id}, user={claims.get('email')}")

            return AuthResult(
                authenticated=True,
                auth_type="jwt",
                user_id=claims.get("sub"),
                email=claims.get("email"),
                plan_id=claims.get("plan_id", "free"),
                scopes=claims.get("scope", "").split(),
                # Include app info: prefer header-based, fall back to JWT claims
                internal_app=internal_app,
                app_id=internal_app.app_id if internal_app else (app_id or jwt_source_app or jwt_client_id),
                app_name=internal_app.name if internal_app else jwt_source_app,
                app_type=internal_app.app_type if internal_app else ("keycloak_client" if jwt_client_id else None),
            )
        except HTTPException:
            pass

    # Not authenticated
    return AuthResult(authenticated=False, auth_type="none")


async def require_auth(auth: AuthResult = Depends(authenticate)) -> AuthResult:
    """Require authentication - raises 401 if not authenticated"""
    if not auth.authenticated:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide API key or JWT token.",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )
    return auth


async def optional_auth(auth: AuthResult = Depends(authenticate)) -> AuthResult:
    """Optional authentication - returns result regardless"""
    return auth


# ============================================================================
# Rate Limiting Dependencies
# ============================================================================


async def check_rate_limit(
    request: Request,
    service: str,
    auth: AuthResult,
    db: AsyncSession,
):
    """Check rate limits and update headers"""
    # Company app whitelist IPs bypass rate limiting entirely
    if auth.is_company_app:
        request.state.rate_limit = -1  # Unlimited
        request.state.rate_limit_remaining = -1
        request.state.rate_limit_reset = 0
        return  # No rate limiting for company apps

    # Determine rate limit based on plan
    plan = PLAN_QUOTAS.get(auth.plan_id, PLAN_QUOTAS["free"])
    multiplier = plan.get("rate_limit_multiplier", 1.0)

    service_config = SERVICE_REGISTRY.get(service, {})
    base_limit = service_config.get("rate_limit", settings.rate_limit_requests)
    limit = int(base_limit * multiplier)

    # Use custom rate limit if set on API key
    if auth.api_key and auth.api_key.custom_rate_limit:
        limit = auth.api_key.custom_rate_limit

    # Identifier for rate limiting
    identifier = auth.user_id or get_client_ip(request)

    allowed, remaining, reset_time = await rate_limiter.check_rate_limit(
        identifier=f"{service}:{identifier}",
        limit=limit,
        window=settings.rate_limit_window,
    )

    # Store for header injection
    request.state.rate_limit = limit
    request.state.rate_limit_remaining = remaining
    request.state.rate_limit_reset = reset_time

    if not allowed:
        RATE_LIMIT_HITS.labels(service=service, limit_type="rate").inc()

        # Log violation
        violation = RateLimitViolation(
            api_key_id=auth.api_key.id if auth.api_key else None,
            client_ip=get_client_ip(request),
            user_id=auth.user_id,
            service=service,
            endpoint=str(request.url.path),
            limit_type="rate",
            limit_value=limit,
            current_value=limit - remaining,
        )
        db.add(violation)
        await db.commit()

        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_time),
                "Retry-After": str(settings.rate_limit_window),
            },
        )


async def check_quota(
    service: str,
    auth: AuthResult,
    quota_type: str = "api_calls",
):
    """Check quota limits"""
    # Company app whitelist IPs bypass quota enforcement
    if auth.is_company_app:
        return  # No quota limits for company apps

    if not auth.authenticated:
        return

    allowed, remaining, limit = await rate_limiter.check_quota(
        user_id=auth.user_id,
        quota_type=quota_type,
        plan_id=auth.plan_id,
    )

    if not allowed:
        RATE_LIMIT_HITS.labels(service=service, limit_type="quota").inc()
        raise HTTPException(
            status_code=429,
            detail=f"Monthly {quota_type} quota exceeded. Upgrade your plan for more capacity.",
            headers={"X-Quota-Remaining": "0"},
        )


# ============================================================================
# Usage Tracking
# ============================================================================


async def track_usage(
    request: Request,
    service: str,
    status_code: int,
    response_time_ms: float,
    auth: AuthResult,
    db: AsyncSession,
    response_size: int = 0,
):
    """Track API usage for analytics and app usage logging"""
    # Standard API usage tracking
    usage = ApiUsage(
        api_key_id=auth.api_key.id if auth.api_key else None,
        user_id=auth.user_id,
        service=service,
        endpoint=str(request.url.path),
        method=request.method,
        api_version=request.state.api_version if hasattr(request.state, "api_version") else "v1",
        status_code=status_code,
        response_time_ms=response_time_ms,
        response_size_bytes=response_size,
        client_ip=get_client_ip(request),
        user_agent=request.headers.get("User-Agent", "")[:500],
    )
    db.add(usage)

    # Track internal app usage if app credentials were provided
    if auth.app_id:
        await log_app_usage(
            db=db,
            app_id=auth.app_id,
            app_name=auth.app_name or "unknown",
            app_type=auth.app_type or "unknown",
            service=service,
            endpoint=str(request.url.path),
            method=request.method,
            status_code=status_code,
            response_time_ms=int(response_time_ms),
            client_ip=get_client_ip(request),
            user_agent=request.headers.get("User-Agent", "")[:500],
            user_id=auth.user_id,
            correlation_id=getattr(request.state, "request_id", None),
            api_version=request.state.api_version if hasattr(request.state, "api_version") else "v1",
            auto_commit=False,  # Will commit at end of track_usage
        )

        # Update Prometheus metrics for app tracking
        APP_REQUEST_COUNT.labels(
            app_id=auth.app_id,
            app_type=auth.app_type or "unknown",
            service=service,
            status=status_code,
        ).inc()

    await db.commit()


# ============================================================================
# Health and Info Endpoints
# ============================================================================


@app.get("/", tags=["Gateway"])
async def root():
    """Gateway root endpoint"""
    return {
        "gateway": "external",
        "version": settings.gateway_version,
        "documentation": "/docs",
        "openapi": "/openapi.json",
    }


@app.get("/health", tags=["Gateway"])
async def health():
    """Gateway health check"""
    return {"status": "healthy", "gateway": "external"}


@app.get("/services", tags=["Gateway"])
async def list_services():
    """List all available services"""
    services = {}
    for name, config in SERVICE_REGISTRY.items():
        services[name] = {
            "prefix": f"/api/v1/{name}",
            "description": config["description"],
            "auth_required": config["auth_required"],
            "rate_limit": config["rate_limit"],
        }
    return {
        "version": "v1",
        "services": services,
    }


@app.get("/plans", tags=["Gateway"])
async def list_plans():
    """List available subscription plans"""
    return {
        "plans": PLAN_QUOTAS,
        "current_version": "v1",
    }


@app.get("/integration.json", tags=["Gateway"])
async def get_integration_spec():
    """
    Get the complete API integration specification.

    This JSON document contains everything needed to integrate with the Data Acuity API:
    - All available services and their endpoints
    - Authentication methods (API key, OAuth2, internal app credentials)
    - Rate limiting details
    - Example requests

    This endpoint is public and does not require authentication.
    """
    # Build integration spec from live configuration
    services_spec = {}
    for name, config in SERVICE_REGISTRY.items():
        service_info = {
            "prefix": config["prefix"],
            "internal_url": config["url"],
            "description": config["description"],
            "auth_required": config["auth_required"],
            "rate_limit": config["rate_limit"],
        }
        # Add public access info if available
        if config.get("public_access"):
            service_info["public_access"] = {
                "enabled": True,
                "rate_limit": config.get("public_rate_limit", 10),
                "daily_limit": config.get("public_daily_limit", 100),
                "description": "Limited public access without credentials"
            }
            service_info["authenticated_rate_limit"] = config["rate_limit"]
        services_spec[name] = service_info

    return {
        "api_gateway": {
            "name": "Data Acuity API Gateway",
            "version": settings.gateway_version,
            "base_url": f"https://{settings.domain}/api",
            "documentation": f"https://{settings.domain}/docs",
            "description": "Unified API gateway for all Data Acuity services"
        },
        "authentication": {
            "methods": [
                {
                    "type": "api_key",
                    "header": "X-API-Key",
                    "prefix": settings.api_key_prefix,
                    "description": "API key for external clients. Obtain from developer portal."
                },
                {
                    "type": "oauth2",
                    "token_url": f"https://auth.{settings.domain}/realms/{settings.keycloak_realm}/protocol/openid-connect/token",
                    "authorization_url": f"https://auth.{settings.domain}/realms/{settings.keycloak_realm}/protocol/openid-connect/auth",
                    "header": "Authorization",
                    "format": "Bearer {token}",
                    "description": "OAuth2/OIDC via Keycloak for user authentication"
                },
                {
                    "type": "internal_app",
                    "headers": {
                        "X-App-ID": "Your registered app ID (e.g., markets-dashboard)",
                        "X-App-Secret": "Your app secret (das_xxxxx)"
                    },
                    "description": "Internal app credentials for company applications. No rate limiting."
                }
            ],
            "company_whitelisted_ips": COMPANY_APP_WHITELIST
        },
        "rate_limiting": {
            "authenticated": {
                "requests_per_minute": settings.rate_limit_requests,
                "burst": 10,
                "description": "Standard rate limit for authenticated requests"
            },
            "unauthenticated": {
                "requests_per_minute": 10,
                "daily_limit": 100,
                "description": "Strict limits for public/unauthenticated access (markets & maps only)"
            },
            "headers": {
                "X-RateLimit-Limit": "Maximum requests allowed",
                "X-RateLimit-Remaining": "Requests remaining in window",
                "X-RateLimit-Reset": "Unix timestamp when limit resets",
                "X-Daily-Limit-Remaining": "Remaining daily requests (unauthenticated only)"
            },
            "bypass": "Requests from whitelisted IPs or with valid internal app credentials bypass rate limiting"
        },
        "services": services_spec,
        "plans": PLAN_QUOTAS,
        "internal_apps": {
            "description": "Pre-registered internal applications for tracking API usage",
            "registration_endpoint": "POST /admin/apps",
            "predefined_apps": [
                {"app_id": "markets-dashboard", "name": "Markets Dashboard", "type": "web_app"},
                {"app_id": "portal-main", "name": "Data Acuity Portal", "type": "web_app"},
                {"app_id": "tagme-mobile-ios", "name": "TagMe iOS App", "type": "mobile_app"},
                {"app_id": "tagme-mobile-android", "name": "TagMe Android App", "type": "mobile_app"},
                {"app_id": "maps-frontend", "name": "Historical Maps Frontend", "type": "web_app"},
                {"app_id": "morph-converter", "name": "Morph File Converter", "type": "web_app"},
                {"app_id": "ai-webui", "name": "AI Brain WebUI", "type": "web_app"},
                {"app_id": "n8n-workflows", "name": "N8N Workflow Automation", "type": "service"},
                {"app_id": "superset-analytics", "name": "Superset Analytics", "type": "service"},
                {"app_id": "twenty-crm", "name": "Twenty CRM", "type": "service"},
                {"app_id": "tgn-ingest", "name": "The Geek Network - Data Ingest", "type": "integration"}
            ]
        },
        "data_ingest": {
            "description": "Data ingestion endpoints for external data sources",
            "base_path": "/api/v1/ingest",
            "authentication": {
                "required": True,
                "method": "X-App-ID + X-App-Secret headers",
                "description": "Contact platform team to register your integration and receive credentials"
            },
            "sources": {
                "tgn": {
                    "name": "The Geek Network",
                    "description": "Anonymized analytics metrics from TGN ecosystem (14 APIs, 260+ metrics)",
                    "endpoints": {
                        "POST /api/v1/ingest/tgn": {
                            "description": "Ingest anonymized metrics from TGN",
                            "max_records_per_request": 1000,
                            "max_payload_size_mb": 10
                        },
                        "GET /api/v1/ingest/tgn/status": {
                            "description": "Check ingest health and statistics"
                        },
                        "GET /api/v1/ingest/tgn/sources": {
                            "description": "List valid source types and period types"
                        },
                        "POST /api/v1/ingest/tgn/validate": {
                            "description": "Validate payload without inserting"
                        },
                        "GET /api/v1/ingest/tgn/schema": {
                            "description": "Get expected schema and example payloads"
                        }
                    },
                    "valid_sources": [
                        "bruh", "auth", "ledger", "payfast", "media", "messaging",
                        "glocell", "sdpkt", "slepton", "tagme", "jobcenter",
                        "bidbaas", "kiffstore", "trustseal", "opsupport"
                    ],
                    "period_types": ["15min", "hourly", "daily", "weekly", "monthly", "quarterly", "yearly"],
                    "storage": {
                        "format": "PostgreSQL JSONB",
                        "partitioning": "Monthly by received_at",
                        "retention": "5 years (South Africa legal requirement)",
                        "legal_hold": "Supported per partition"
                    },
                    "example_payload": {
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
                                    "mfa_adoption_rate": 0.42
                                },
                                "metadata": {
                                    "generator_version": "1.0.0"
                                }
                            }
                        ]
                    }
                }
            }
        },
        "navigation": {
            "description": "Google Maps-like navigation services powered by open-source tools",
            "base_path": "/api/v1/maps",
            "services": {
                "routing": {
                    "provider": "OSRM (Open Source Routing Machine)",
                    "coverage": "South Africa",
                    "data_source": "OpenStreetMap",
                    "cost": "Free (self-hosted)"
                },
                "geocoding": {
                    "provider": "Nominatim",
                    "coverage": "South Africa",
                    "data_source": "OpenStreetMap",
                    "cost": "Free (self-hosted)"
                },
                "traffic": {
                    "provider": "Crowdsourced from TagMe users",
                    "description": "Real-time traffic derived from anonymized TagMe location data",
                    "cost": "Free"
                }
            },
            "endpoints": {
                "POST /api/v1/maps/api/route": {
                    "description": "Get driving/walking/cycling directions between points",
                    "parameters": {
                        "origin": {"lat": "number", "lng": "number"},
                        "destination": {"lat": "number", "lng": "number"},
                        "waypoints": "Optional list of intermediate points",
                        "mode": "driving | walking | cycling",
                        "alternatives": "Return alternative routes (boolean)",
                        "include_traffic": "Include traffic-adjusted ETA (boolean)"
                    },
                    "returns": "Route geometry, distance, duration, turn-by-turn instructions"
                },
                "GET /api/v1/maps/api/route/simple": {
                    "description": "Simple GET-based routing for quick queries",
                    "parameters": {
                        "origin": "lat,lng",
                        "destination": "lat,lng",
                        "mode": "driving | walking | cycling"
                    }
                },
                "GET /api/v1/maps/api/geocode": {
                    "description": "Convert address to coordinates",
                    "parameters": {
                        "q": "Address or place name to search"
                    },
                    "returns": "List of matching places with coordinates"
                },
                "GET /api/v1/maps/api/reverse-geocode": {
                    "description": "Convert coordinates to address",
                    "parameters": {
                        "lat": "Latitude",
                        "lng": "Longitude"
                    },
                    "returns": "Address details for the location"
                },
                "GET /api/v1/maps/api/autocomplete": {
                    "description": "Address autocomplete suggestions",
                    "parameters": {
                        "q": "Partial address query",
                        "limit": "Max results (default 5)"
                    }
                },
                "GET /api/v1/maps/api/traffic": {
                    "description": "Get real-time traffic conditions from crowdsourced TagMe data",
                    "parameters": {
                        "bbox": "Bounding box: minLng,minLat,maxLng,maxLat"
                    },
                    "returns": "Traffic levels (free_flow, light, moderate, heavy, severe) by road segment"
                },
                "GET /api/v1/maps/api/traffic/route": {
                    "description": "Get route with traffic-adjusted ETA",
                    "parameters": {
                        "origin": "lat,lng",
                        "destination": "lat,lng"
                    },
                    "returns": "Route with traffic delay and adjusted arrival time"
                },
                "GET /api/v1/maps/api/navigation/status": {
                    "description": "Check health of navigation services (OSRM, Nominatim)"
                }
            },
            "examples": {
                "route_request": {
                    "curl": f"curl -X POST 'https://{settings.domain}/api/v1/maps/api/route' -H 'Content-Type: application/json' -d '{{\"origin\": {{\"lat\": -26.2041, \"lng\": 28.0473}}, \"destination\": {{\"lat\": -33.9249, \"lng\": 18.4241}}, \"mode\": \"driving\"}}'",
                    "description": "Get driving directions from Johannesburg to Cape Town"
                },
                "geocode_request": {
                    "curl": f"curl 'https://{settings.domain}/api/v1/maps/api/geocode?q=Sandton+City+Mall'",
                    "description": "Find coordinates for Sandton City Mall"
                },
                "traffic_request": {
                    "curl": f"curl 'https://{settings.domain}/api/v1/maps/api/traffic?bbox=28.0,−26.3,28.1,−26.1'",
                    "description": "Get traffic conditions in Johannesburg CBD area"
                }
            }
        },
        "common_headers": {
            "request": {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Request-ID": "Optional unique request identifier (UUID)",
                "X-Correlation-ID": "Optional correlation ID for distributed tracing"
            },
            "response": {
                "X-Request-ID": "Request identifier (echoed or generated)",
                "X-RateLimit-Limit": "Rate limit ceiling",
                "X-RateLimit-Remaining": "Remaining requests",
                "X-RateLimit-Reset": "Reset timestamp"
            }
        },
        "error_responses": {
            "400": {"error": "Bad Request", "description": "Invalid request parameters"},
            "401": {"error": "Unauthorized", "description": "Missing or invalid authentication"},
            "403": {"error": "Forbidden", "description": "Insufficient permissions"},
            "404": {"error": "Not Found", "description": "Resource not found"},
            "429": {"error": "Too Many Requests", "description": "Rate limit exceeded"},
            "500": {"error": "Internal Server Error", "description": "Server error"},
            "502": {"error": "Bad Gateway", "description": "Upstream service unavailable"},
            "503": {"error": "Service Unavailable", "description": "Service temporarily unavailable"}
        },
        "examples": {
            "api_key_request": {
                "curl": f"curl -X GET 'https://{settings.domain}/api/v1/markets/prices' -H 'X-API-Key: dak_your_api_key_here'",
                "description": "API key authentication (60 req/min)"
            },
            "internal_app_request": {
                "curl": f"curl -X GET 'https://{settings.domain}/api/v1/markets/prices' -H 'X-App-ID: markets-dashboard' -H 'X-App-Secret: das_your_app_secret'",
                "description": "Internal app authentication (no rate limiting)"
            },
            "oauth2_request": {
                "curl": f"curl -X GET 'https://{settings.domain}/api/v1/billing/subscriptions' -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIs...'",
                "description": "OAuth2 bearer token authentication"
            },
            "public_request": {
                "curl": f"curl -X GET 'https://{settings.domain}/api/v1/markets/prices'",
                "description": "Public access to markets/maps only (10 req/min, 100/day limit)"
            }
        },
        "support": {
            "documentation": f"https://docs.{settings.domain}",
            "status_page": f"https://status.{settings.domain}",
            "contact": f"api-support@{settings.domain}"
        }
    }


@app.get("/whitelist/status", tags=["Gateway"])
async def whitelist_status(request: Request):
    """
    Check if the current request IP is in the company app whitelist.
    Whitelisted IPs receive enterprise-level access without API keys.
    """
    client_ip = get_client_ip(request)
    is_whitelisted = is_company_app_ip(client_ip)

    return {
        "client_ip": client_ip,
        "is_whitelisted": is_whitelisted,
        "whitelist_ips": COMPANY_APP_WHITELIST if is_whitelisted else "hidden",
        "privileges": {
            "rate_limiting": "bypassed" if is_whitelisted else "enforced",
            "quota_enforcement": "bypassed" if is_whitelisted else "enforced",
            "authentication": "automatic (enterprise)" if is_whitelisted else "required",
            "service_access": "all services" if is_whitelisted else "per API key scope",
        } if is_whitelisted else None,
        "message": "Your IP is whitelisted for company app access" if is_whitelisted else "Your IP is not whitelisted. Use API key or JWT for authentication.",
    }


@app.get("/metrics", include_in_schema=False)
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/app/verify", tags=["Internal Apps"])
async def verify_app_credentials(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify internal app credentials and return app information.

    Include X-App-ID and X-App-Secret headers to verify your app credentials.
    This endpoint is useful for testing your app integration before making API calls.
    """
    app_id = request.headers.get("X-App-ID")
    app_secret = request.headers.get("X-App-Secret")

    if not app_id or not app_secret:
        return {
            "verified": False,
            "error": "Missing X-App-ID or X-App-Secret headers",
            "usage": {
                "description": "Include X-App-ID and X-App-Secret headers to identify your internal app",
                "headers": {
                    "X-App-ID": "Your registered app identifier (e.g., 'markets-dashboard')",
                    "X-App-Secret": "Your app secret (das_xxxxx...)"
                }
            }
        }

    app = await validate_app_credentials(db, app_id, app_secret)

    if app:
        return {
            "verified": True,
            "app": {
                "app_id": app.app_id,
                "name": app.name,
                "description": app.description,
                "app_type": app.app_type,
                "team": app.team,
                "environment": app.environment,
                "is_active": app.is_active,
                "total_requests": app.total_requests,
                "last_used_at": app.last_used_at.isoformat() if app.last_used_at else None,
                "created_at": app.created_at.isoformat() if app.created_at else None,
            }
        }
    else:
        return {
            "verified": False,
            "error": "Invalid app credentials",
            "app_id": app_id,
        }


# ============================================================================
# API Key Management Endpoints
# ============================================================================


@app.get("/api/v1/keys", tags=["API Keys"])
async def list_api_keys(
    auth: AuthResult = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the authenticated user"""
    from shared import ApiKeyStatus

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.user_id == auth.user_id,
            ApiKey.status != ApiKeyStatus.REVOKED,
        )
    )
    keys = result.scalars().all()

    return {
        "keys": [
            {
                "id": str(key.id),
                "name": key.name,
                "key_prefix": key.key_prefix,
                "status": key.status.value,
                "created_at": key.created_at.isoformat(),
                "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
                "expires_at": key.expires_at.isoformat() if key.expires_at else None,
                "total_requests": key.total_requests,
            }
            for key in keys
        ]
    }


@app.post("/api/v1/keys", tags=["API Keys"])
async def create_api_key(
    name: str,
    description: str = "",
    scopes: list[str] = None,
    allowed_services: list[str] = None,
    auth: AuthResult = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key"""
    from shared import generate_api_key, get_key_prefix, ApiKeyType

    # Generate key
    full_key, key_hash = generate_api_key(prefix=settings.api_key_prefix)

    new_key = ApiKey(
        key_hash=key_hash,
        key_prefix=get_key_prefix(full_key),
        user_id=auth.user_id,
        email=auth.email,
        name=name,
        description=description,
        key_type=ApiKeyType.EXTERNAL,
        scopes=scopes or ["*"],
        allowed_services=allowed_services or [],
        plan_id=auth.plan_id,
    )

    db.add(new_key)
    await db.commit()

    return {
        "id": str(new_key.id),
        "key": full_key,  # Only shown once!
        "name": name,
        "message": "Save this key securely. It will not be shown again.",
    }


@app.delete("/api/v1/keys/{key_id}", tags=["API Keys"])
async def revoke_api_key(
    key_id: str,
    auth: AuthResult = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key"""
    from shared import ApiKeyStatus
    import uuid

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == uuid.UUID(key_id),
            ApiKey.user_id == auth.user_id,
        )
    )
    key = result.scalar_one_or_none()

    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    key.status = ApiKeyStatus.REVOKED
    key.revoked_at = datetime.utcnow()
    await db.commit()

    return {"message": "API key revoked successfully"}


# ============================================================================
# Usage and Quota Endpoints
# ============================================================================


@app.get("/api/v1/usage", tags=["Usage"])
async def get_usage(
    auth: AuthResult = Depends(require_auth),
):
    """Get current usage and quota status"""
    usage = await rate_limiter.get_quota_usage(auth.user_id, auth.plan_id)
    return {
        "user_id": auth.user_id,
        "plan": auth.plan_id,
        "period": datetime.utcnow().strftime("%Y-%m"),
        "usage": usage,
    }


# ============================================================================
# Proxy Routes - External Client Access
# ============================================================================


@app.api_route(
    "/api/{version}/{service}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    tags=["Proxy"],
)
async def proxy_to_service(
    request: Request,
    version: str,
    service: str,
    path: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Proxy requests to backend services.
    Path format: /api/v1/{service}/{path}
    """
    start_time = datetime.utcnow()

    # Validate version
    if version not in settings.supported_versions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported API version: {version}. Supported: {settings.supported_versions}",
        )

    request.state.api_version = version

    # Validate service
    if service not in SERVICE_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown service: {service}. Available: {list(SERVICE_REGISTRY.keys())}",
        )

    config = SERVICE_REGISTRY[service]

    # Authenticate
    auth = await authenticate(
        request,
        api_key=request.headers.get("X-API-Key"),
        bearer_token=None,  # Will check Authorization header
        db=db,
    )

    # Check if auth is required for this service
    if config["auth_required"] and not auth.authenticated:
        raise HTTPException(
            status_code=401,
            detail="Authentication required for this service",
        )

    # Check service access
    if auth.authenticated and auth.allowed_services:
        if not check_service_access(service, auth.allowed_services):
            raise HTTPException(
                status_code=403,
                detail=f"API key not authorized for service: {service}",
            )

    # Check rate limits
    await check_rate_limit(request, service, auth, db)

    # Check quota
    await check_quota(service, auth, "api_calls")

    # Build target URL
    target_url = f"{config['url']}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    # Prepare headers
    headers = dict(request.headers)
    headers.pop("host", None)
    headers["X-Forwarded-For"] = get_client_ip(request)
    headers["X-Request-ID"] = getattr(request.state, "request_id", str(uuid.uuid4()))
    headers["X-Gateway"] = "external"
    headers["X-API-Version"] = version
    if auth.user_id:
        headers["X-User-ID"] = auth.user_id
    # Forward internal app identification to backend services
    if auth.app_id:
        headers["X-App-ID"] = auth.app_id
    if auth.app_name:
        headers["X-App-Name"] = auth.app_name
    if auth.app_type:
        headers["X-App-Type"] = auth.app_type

    # Get request body
    body = await request.body()

    # Proxy the request
    try:
        with REQUEST_LATENCY.labels(service=service, method=request.method).time():
            response = await http_client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )

        response_time_ms = (datetime.utcnow() - start_time).total_seconds() * 1000

        REQUEST_COUNT.labels(
            service=service,
            method=request.method,
            status=response.status_code,
            auth_type=auth.auth_type,
        ).inc()

        # Track usage
        await track_usage(
            request=request,
            service=service,
            status_code=response.status_code,
            response_time_ms=response_time_ms,
            auth=auth,
            db=db,
            response_size=len(response.content),
        )

        # Build response with rate limit headers
        response_headers = dict(response.headers)
        response_headers["X-RateLimit-Limit"] = str(getattr(request.state, "rate_limit", 0))
        response_headers["X-RateLimit-Remaining"] = str(
            getattr(request.state, "rate_limit_remaining", 0)
        )
        response_headers["X-RateLimit-Reset"] = str(
            getattr(request.state, "rate_limit_reset", 0)
        )

        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=response_headers,
            media_type=response.headers.get("content-type"),
        )

    except httpx.RequestError as e:
        REQUEST_COUNT.labels(
            service=service, method=request.method, status=502, auth_type=auth.auth_type
        ).inc()
        logger.error(f"Error proxying to {service}: {e}")
        raise HTTPException(status_code=502, detail=f"Service unavailable: {service}")


# ============================================================================
# Application Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8081,
        reload=settings.debug,
    )
