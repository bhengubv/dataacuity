"""
Data Acuity API Gateway - Shared Configuration
Centralized configuration for both internal and external gateways
"""

import os
from enum import Enum
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Environment(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class GatewayType(str, Enum):
    INTERNAL = "internal"
    EXTERNAL = "external"


# =============================================================================
# COMPANY APP WHITELIST
# =============================================================================
# These IPs are trusted company application sources that receive:
# - Bypassed rate limiting (treated as internal traffic)
# - No quota enforcement
# - Automatic authentication as "company_app" user
# - Full access to all services without API key requirement
# =============================================================================
COMPANY_APP_WHITELIST = [
    "197.97.200.118",
    "197.97.200.104",
    "197.97.200.105",
    "197.97.200.106",
    "196.22.142.107",
]

# CIDR notation for network-level checks (if needed)
COMPANY_APP_NETWORKS = [
    "197.97.200.104/30",  # Covers .104, .105, .106, .107
    "197.97.200.118/32",
    "196.22.142.107/32",
]


class Settings(BaseSettings):
    """Base settings shared across gateways"""

    # Environment
    environment: Environment = Field(default=Environment.DEVELOPMENT)
    debug: bool = Field(default=False)

    # Gateway identification
    gateway_type: GatewayType = Field(default=GatewayType.INTERNAL)
    gateway_version: str = Field(default="1.0.0")

    # Domain configuration
    domain: str = Field(default="dataacuity.co.za")
    internal_domain: str = Field(default="internal.dataacuity.local")

    # Database (for API keys, quotas, analytics)
    database_url: str = Field(
        default="postgresql://gateway:gateway_secret@gateway-db:5432/api_gateway"
    )

    # Redis (for rate limiting, caching)
    redis_url: str = Field(default="redis://gateway-redis:6379/0")

    # Keycloak (for OAuth2/JWT validation)
    keycloak_url: str = Field(default="http://keycloak:8080")
    keycloak_realm: str = Field(default="dataacuity")
    keycloak_client_id: str = Field(default="api-gateway")
    keycloak_client_secret: str = Field(default="")

    # Rate limiting defaults
    rate_limit_requests: int = Field(default=100)
    rate_limit_window: int = Field(default=60)  # seconds

    # API versioning
    default_api_version: str = Field(default="v1")
    supported_versions: list[str] = Field(default=["v1"])

    # Logging
    log_level: str = Field(default="INFO")

    # CORS
    cors_origins: list[str] = Field(default=["*"])

    class Config:
        env_prefix = "GATEWAY_"
        env_file = ".env"


class InternalSettings(Settings):
    """Settings specific to internal gateway"""

    gateway_type: GatewayType = GatewayType.INTERNAL

    # Internal services don't need strict rate limiting
    rate_limit_requests: int = Field(default=1000)
    rate_limit_window: int = Field(default=60)

    # Service mesh authentication
    service_mesh_enabled: bool = Field(default=True)
    trusted_service_tokens: list[str] = Field(default=[])

    # Internal service registry
    service_discovery_enabled: bool = Field(default=True)


class ExternalSettings(Settings):
    """Settings specific to external gateway"""

    gateway_type: GatewayType = GatewayType.EXTERNAL

    # Stricter rate limiting for external clients
    rate_limit_requests: int = Field(default=100)
    rate_limit_window: int = Field(default=60)

    # API key settings
    api_key_header: str = Field(default="X-API-Key")
    api_key_prefix: str = Field(default="dak_")  # Data Acuity Key

    # OAuth2 settings
    oauth2_enabled: bool = Field(default=True)
    jwt_algorithm: str = Field(default="RS256")

    # Quota enforcement
    quota_enabled: bool = Field(default=True)

    # Webhook for usage notifications
    usage_webhook_url: Optional[str] = Field(default=None)


# Service registry - maps service names to their internal URLs
SERVICE_REGISTRY = {
    "markets": {
        "url": "http://markets-api:5010",
        "health": "/health",
        "prefix": "/api/v1/markets",
        "description": "Market data, prices, predictions, and sentiment analysis",
        "rate_limit": 60,
        "auth_required": True,
        "public_access": True,  # Allow unauthenticated access with stricter limits
        "public_rate_limit": 10,  # 10 req/min for unauthenticated
        "public_daily_limit": 100,  # 100 requests per day without auth
    },
    "maps": {
        "url": "http://maps_api:8000",
        "health": "/api/health",
        "prefix": "/api/v1/maps",
        "description": "Maps, navigation, routing, geocoding, and crowdsourced traffic data",
        "rate_limit": 60,
        "auth_required": True,
        "public_access": True,  # Allow unauthenticated access with stricter limits
        "public_rate_limit": 10,  # 10 req/min for unauthenticated
        "public_daily_limit": 100,  # 100 requests per day without auth
    },
    "tagme": {
        "url": "http://tagme-api:8000",
        "health": "/health",
        "prefix": "/api/v1/tagme",
        "description": "Location data ingestion from TagMe mobile app",
        "rate_limit": 100,
        "auth_required": True,
    },
    "billing": {
        "url": "http://portal:80",
        "health": "/billing/api/subscriptions.php?action=status",
        "prefix": "/api/v1/billing",
        "description": "Subscription and billing management",
        "rate_limit": 30,
        "auth_required": True,
    },
    "morph": {
        "url": "http://morph:3000",
        "health": "/healthcheck",
        "prefix": "/api/v1/convert",
        "description": "File format conversion service",
        "rate_limit": 10,
        "auth_required": True,
    },
    "ai": {
        "url": "http://ai_brain_ollama:11434",
        "health": "/api/tags",
        "prefix": "/api/v1/ai",
        "description": "AI/LLM inference and generation",
        "rate_limit": 20,
        "auth_required": True,
    },
    "openbb": {
        "url": "http://openbb-platform:6900",
        "health": "/",
        "prefix": "/api/v1/openbb",
        "description": "OpenBB financial data platform",
        "rate_limit": 60,
        "auth_required": True,
    },
    "crm": {
        "url": "http://twenty_crm:3000",
        "health": "/healthz",
        "prefix": "/api/v1/crm",
        "description": "Twenty CRM - customer relationship management",
        "rate_limit": 60,
        "auth_required": True,
    },
    "n8n": {
        "url": "http://n8n:5678",
        "health": "/healthz",
        "prefix": "/api/v1/workflows",
        "description": "N8N workflow automation and integrations",
        "rate_limit": 30,
        "auth_required": True,
    },
    "superset": {
        "url": "http://superset:8088",
        "health": "/health",
        "prefix": "/api/v1/analytics",
        "description": "Apache Superset business intelligence and data visualization",
        "rate_limit": 60,
        "auth_required": True,
    },
    "etl": {
        "url": "http://172.17.0.1:5002",
        "health": "/api/v1/health",
        "prefix": "/api/v1/etl",
        "description": "Airbyte ETL - data integration and synchronization",
        "rate_limit": 30,
        "auth_required": True,
    },
    "dashboard": {
        "url": "http://dashboard-backend:5000",
        "health": "/health",
        "prefix": "/api/v1/status",
        "description": "System status dashboard and monitoring",
        "rate_limit": 60,
        "auth_required": True,
    },
    "bio": {
        "url": "http://bio_onelink:3000",
        "health": "/api/health",
        "prefix": "/api/v1/bio",
        "description": "Link-in-bio service for social media profiles",
        "rate_limit": 60,
        "auth_required": True,
    },
}

# Plan-based quotas (monthly limits)
PLAN_QUOTAS = {
    "free": {
        "api_calls": 1000,
        "ai_requests": 50,
        "file_conversions": 20,
        "data_exports": 10,
        "rate_limit_multiplier": 1.0,
    },
    "starter": {
        "api_calls": 50000,
        "ai_requests": 500,
        "file_conversions": 500,
        "data_exports": 100,
        "rate_limit_multiplier": 2.0,
    },
    "growth": {
        "api_calls": 250000,
        "ai_requests": 2500,
        "file_conversions": -1,  # unlimited
        "data_exports": 1000,
        "rate_limit_multiplier": 5.0,
    },
    "enterprise": {
        "api_calls": -1,  # unlimited
        "ai_requests": -1,
        "file_conversions": -1,
        "data_exports": -1,
        "rate_limit_multiplier": 10.0,
    },
}
