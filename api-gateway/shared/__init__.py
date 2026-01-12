"""
Data Acuity API Gateway - Shared Module
Common utilities for internal and external gateways
"""

from .config import (
    Settings,
    InternalSettings,
    ExternalSettings,
    GatewayType,
    Environment,
    SERVICE_REGISTRY,
    PLAN_QUOTAS,
    COMPANY_APP_WHITELIST,
    COMPANY_APP_NETWORKS,
)
from .models import (
    Base,
    ApiKey,
    ApiKeyStatus,
    ApiKeyType,
    ServiceToken,
    ApiUsage,
    QuotaUsage,
    RateLimitViolation,
    WebhookLog,
)
from .database import init_db, close_db, get_db, get_session, get_dwh, get_dwh_session
from .auth import (
    hash_key,
    generate_api_key,
    get_key_prefix,
    validate_api_key,
    validate_service_token,
    get_client_ip,
    check_scope,
    check_service_access,
    is_company_app_ip,
    is_trusted_internal_ip,
    KeycloakValidator,
    api_key_header,
    bearer_scheme,
)
from .rate_limiter import RateLimiter, rate_limiter
from .app_credentials import (
    AppType,
    InternalApp,
    AppUsageLog,
    PREDEFINED_APPS,
    generate_app_secret,
    get_secret_prefix,
    hash_secret,
    validate_app_credentials,
    get_app_by_id,
    create_app,
    regenerate_app_secret,
    log_app_usage,
    get_app_usage_stats,
)

__all__ = [
    # Config
    "Settings",
    "InternalSettings",
    "ExternalSettings",
    "GatewayType",
    "Environment",
    "SERVICE_REGISTRY",
    "PLAN_QUOTAS",
    "COMPANY_APP_WHITELIST",
    "COMPANY_APP_NETWORKS",
    # Models
    "Base",
    "ApiKey",
    "ApiKeyStatus",
    "ApiKeyType",
    "ServiceToken",
    "ApiUsage",
    "QuotaUsage",
    "RateLimitViolation",
    "WebhookLog",
    # Database
    "init_db",
    "close_db",
    "get_db",
    "get_session",
    "get_dwh",
    "get_dwh_session",
    # Auth
    "hash_key",
    "generate_api_key",
    "get_key_prefix",
    "validate_api_key",
    "validate_service_token",
    "get_client_ip",
    "check_scope",
    "check_service_access",
    "is_company_app_ip",
    "is_trusted_internal_ip",
    "KeycloakValidator",
    "api_key_header",
    "bearer_scheme",
    # Rate Limiter
    "RateLimiter",
    "rate_limiter",
    # App Credentials
    "AppType",
    "InternalApp",
    "AppUsageLog",
    "PREDEFINED_APPS",
    "generate_app_secret",
    "get_secret_prefix",
    "hash_secret",
    "validate_app_credentials",
    "get_app_by_id",
    "create_app",
    "regenerate_app_secret",
    "log_app_usage",
    "get_app_usage_stats",
]
