"""
Data Acuity API Gateway - Authentication Utilities
Shared authentication logic for internal and external gateways
"""

import hashlib
import secrets
import httpx
from datetime import datetime, timedelta
from typing import Optional, Tuple
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
import os

from .models import ApiKey, ApiKeyStatus, ServiceToken
from .config import ExternalSettings, SERVICE_REGISTRY, COMPANY_APP_WHITELIST


# Security schemes
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


def hash_key(key: str) -> str:
    """Hash an API key using SHA-256"""
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key(prefix: str = "dak_") -> Tuple[str, str]:
    """
    Generate a new API key
    Returns: (full_key, key_hash)
    """
    # Generate 32 random bytes, encode as hex (64 chars)
    random_part = secrets.token_hex(32)
    full_key = f"{prefix}{random_part}"
    key_hash = hash_key(full_key)
    return full_key, key_hash


def get_key_prefix(key: str) -> str:
    """Extract the prefix portion of an API key for identification"""
    # Return first 12 characters (prefix + first 8 of random part)
    return key[:12] if len(key) >= 12 else key


class KeycloakValidator:
    """Validate JWT tokens against Keycloak"""

    def __init__(self, settings: ExternalSettings):
        self.settings = settings
        self._jwks_cache: Optional[dict] = None
        self._jwks_cache_time: Optional[datetime] = None
        self._cache_ttl = timedelta(hours=1)

    async def get_jwks(self) -> dict:
        """Fetch JWKS from Keycloak with caching"""
        now = datetime.utcnow()

        if (
            self._jwks_cache
            and self._jwks_cache_time
            and now - self._jwks_cache_time < self._cache_ttl
        ):
            return self._jwks_cache

        jwks_url = (
            f"{self.settings.keycloak_url}/realms/"
            f"{self.settings.keycloak_realm}/protocol/openid-connect/certs"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_url)
            response.raise_for_status()
            self._jwks_cache = response.json()
            self._jwks_cache_time = now
            return self._jwks_cache

    async def validate_token(self, token: str) -> dict:
        """
        Validate a JWT token and return the claims
        Raises HTTPException on validation failure
        """
        try:
            # Get JWKS
            jwks = await self.get_jwks()

            # Decode without verification first to get the key ID
            unverified = jwt.get_unverified_header(token)
            kid = unverified.get("kid")

            # Find the matching key
            key = None
            for k in jwks.get("keys", []):
                if k.get("kid") == kid:
                    key = k
                    break

            if not key:
                raise HTTPException(status_code=401, detail="Invalid token: key not found")

            # Verify and decode
            claims = jwt.decode(
                token,
                key,
                algorithms=[self.settings.jwt_algorithm, "RS256"],
                audience=self.settings.keycloak_client_id,
                issuer=f"{self.settings.keycloak_url}/realms/{self.settings.keycloak_realm}",
            )

            return claims

        except JWTError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def validate_api_key(
    db: AsyncSession, key: str, request: Request
) -> Optional[ApiKey]:
    """
    Validate an API key and return the ApiKey model if valid
    Also updates last_used_at and total_requests
    """
    key_hash = hash_key(key)

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash, ApiKey.status == ApiKeyStatus.ACTIVE
        )
    )
    api_key = result.scalar_one_or_none()

    if not api_key:
        return None

    # Check expiration
    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
        api_key.status = ApiKeyStatus.EXPIRED
        await db.commit()
        return None

    # Check IP restrictions
    if api_key.allowed_ips:
        client_ip = get_client_ip(request)
        if client_ip not in api_key.allowed_ips:
            return None

    # Update usage stats
    api_key.last_used_at = datetime.utcnow()
    api_key.total_requests += 1
    await db.commit()

    return api_key


async def validate_service_token(db: AsyncSession, token: str) -> Optional[ServiceToken]:
    """Validate an internal service token"""
    token_hash = hash_key(token)

    result = await db.execute(
        select(ServiceToken).where(
            ServiceToken.token_hash == token_hash, ServiceToken.is_active == True
        )
    )
    service_token = result.scalar_one_or_none()

    if service_token:
        service_token.last_used_at = datetime.utcnow()
        await db.commit()

    return service_token


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies"""
    # Check for forwarded headers (from Traefik/nginx)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # First IP in the chain is the original client
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fall back to direct client
    return request.client.host if request.client else "unknown"


def check_scope(required_scope: str, granted_scopes: list) -> bool:
    """
    Check if a required scope is satisfied by granted scopes
    Supports wildcard matching (e.g., "markets:*" matches "markets:read")
    """
    if not granted_scopes:
        return False

    if "*" in granted_scopes:
        return True

    for scope in granted_scopes:
        if scope == required_scope:
            return True
        # Wildcard matching
        if scope.endswith(":*"):
            prefix = scope[:-1]  # Remove the *
            if required_scope.startswith(prefix):
                return True

    return False


def check_service_access(service: str, allowed_services: list) -> bool:
    """Check if access to a service is allowed"""
    if not allowed_services:
        return True  # Empty list = all services allowed

    return service in allowed_services


def is_company_app_ip(ip: str) -> bool:
    """
    Check if an IP address is in the company app whitelist.

    Company app IPs receive special treatment:
    - No rate limiting
    - No quota enforcement
    - Automatic authentication as internal company app
    - Full access to all services
    """
    return ip in COMPANY_APP_WHITELIST


def is_trusted_internal_ip(ip: str) -> bool:
    """
    Check if an IP is from a trusted internal network or company app.

    Trusted sources:
    - Company app whitelist IPs
    - Docker internal networks (172.x.x.x)
    - Private networks (10.x.x.x, 192.168.x.x)
    - Localhost
    """
    # Check company whitelist first
    if is_company_app_ip(ip):
        return True

    # Check internal/private networks
    if ip.startswith(("10.", "172.", "192.168.", "127.")):
        return True

    return False
