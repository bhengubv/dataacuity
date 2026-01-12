"""
Data Acuity API Gateway - Internal App Credentials System
Universal credentials for tracking which internal app is making API calls

This system allows:
- Registration of internal applications (web apps, mobile apps, services)
- Tracking of which app made each API call
- Usage analytics per application
- No rate limiting (internal apps are trusted)
"""

import secrets
import hashlib
from datetime import datetime
from typing import Optional, List
from enum import Enum
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, BigInteger, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from .models import Base


class AppType(str, Enum):
    """Types of internal applications"""
    WEB_APP = "web_app"          # Browser-based web applications
    MOBILE_APP = "mobile_app"    # Mobile applications (iOS, Android)
    DESKTOP_APP = "desktop_app"  # Desktop applications
    SERVICE = "service"          # Backend services
    CLI = "cli"                  # Command-line tools
    INTEGRATION = "integration"  # Third-party integrations


class InternalApp(Base):
    """
    Internal application registration for credential tracking.
    Each app gets a unique app_id and app_secret for identification.
    """
    __tablename__ = "internal_apps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # App identification
    app_id = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "markets-dashboard"
    app_secret_hash = Column(String(64), nullable=False)  # Hashed secret
    app_secret_prefix = Column(String(12), nullable=False)  # First 8 chars for identification

    # App metadata
    name = Column(String(255), nullable=False)  # Human-readable name
    description = Column(Text, nullable=True)
    app_type = Column(String(50), nullable=False)  # web_app, mobile_app, service, etc.
    version = Column(String(50), nullable=True)  # App version

    # Owner/team info
    team = Column(String(100), nullable=True)  # e.g., "frontend", "mobile", "backend"
    owner_email = Column(String(255), nullable=True)

    # Environment
    environment = Column(String(20), default="production")  # production, staging, development

    # Access control
    is_active = Column(Boolean, default=True)
    allowed_services = Column(JSON, default=list)  # Empty = all services

    # Tracking
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    total_requests = Column(BigInteger, default=0)

    __table_args__ = (
        Index("ix_internal_apps_type", "app_type"),
        Index("ix_internal_apps_team", "team"),
    )


class AppUsageLog(Base):
    """
    Detailed usage log for internal apps.
    Tracks every API call with app identification.
    """
    __tablename__ = "app_usage_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # App identification
    app_id = Column(String(50), nullable=False, index=True)
    app_name = Column(String(255), nullable=True)
    app_type = Column(String(50), nullable=True)

    # Request details
    service = Column(String(100), nullable=False, index=True)
    endpoint = Column(String(500), nullable=False)
    method = Column(String(10), nullable=False)
    api_version = Column(String(10), default="v1")

    # Response details
    status_code = Column(Integer, nullable=False)
    response_time_ms = Column(Integer, nullable=False)

    # Client info
    client_ip = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)

    # Additional context
    user_id = Column(String(255), nullable=True)  # If user is also authenticated
    correlation_id = Column(String(36), nullable=True)

    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_app_usage_app_time", "app_id", "timestamp"),
        Index("ix_app_usage_service_time", "service", "timestamp"),
    )


# Pre-defined internal apps
PREDEFINED_APPS = [
    {
        "app_id": "markets-dashboard",
        "name": "Markets Dashboard",
        "description": "Main markets web dashboard at markets.dataacuity.co.za",
        "app_type": AppType.WEB_APP,
        "team": "frontend",
    },
    {
        "app_id": "portal-main",
        "name": "Data Acuity Portal",
        "description": "Main portal at dataacuity.co.za",
        "app_type": AppType.WEB_APP,
        "team": "frontend",
    },
    {
        "app_id": "tagme-mobile-ios",
        "name": "TagMe iOS App",
        "description": "TagMe location tracking iOS application",
        "app_type": AppType.MOBILE_APP,
        "team": "mobile",
    },
    {
        "app_id": "tagme-mobile-android",
        "name": "TagMe Android App",
        "description": "TagMe location tracking Android application",
        "app_type": AppType.MOBILE_APP,
        "team": "mobile",
    },
    {
        "app_id": "maps-frontend",
        "name": "Historical Maps Frontend",
        "description": "Historical maps web application",
        "app_type": AppType.WEB_APP,
        "team": "frontend",
    },
    {
        "app_id": "morph-converter",
        "name": "Morph File Converter",
        "description": "File conversion web interface at convert.dataacuity.co.za",
        "app_type": AppType.WEB_APP,
        "team": "tools",
    },
    {
        "app_id": "ai-webui",
        "name": "AI Brain WebUI",
        "description": "AI chat interface at ai.dataacuity.co.za",
        "app_type": AppType.WEB_APP,
        "team": "ai",
    },
    {
        "app_id": "n8n-workflows",
        "name": "N8N Workflow Automation",
        "description": "Workflow automation service",
        "app_type": AppType.SERVICE,
        "team": "automation",
    },
    {
        "app_id": "superset-analytics",
        "name": "Superset Analytics",
        "description": "Business intelligence and analytics",
        "app_type": AppType.SERVICE,
        "team": "analytics",
    },
    {
        "app_id": "twenty-crm",
        "name": "Twenty CRM",
        "description": "Customer relationship management",
        "app_type": AppType.SERVICE,
        "team": "sales",
    },
]


def generate_app_secret(prefix: str = "das_") -> tuple[str, str]:
    """
    Generate a new app secret.
    Returns: (full_secret, secret_hash)
    """
    random_part = secrets.token_hex(24)
    full_secret = f"{prefix}{random_part}"
    secret_hash = hashlib.sha256(full_secret.encode()).hexdigest()
    return full_secret, secret_hash


def get_secret_prefix(secret: str) -> str:
    """Extract prefix from secret for identification"""
    return secret[:12] if len(secret) >= 12 else secret


def hash_secret(secret: str) -> str:
    """Hash an app secret"""
    return hashlib.sha256(secret.encode()).hexdigest()


async def validate_app_credentials(
    db: AsyncSession,
    app_id: str,
    app_secret: str
) -> Optional[InternalApp]:
    """
    Validate app credentials and return the app if valid.
    Also updates last_used_at and total_requests.
    """
    secret_hash = hash_secret(app_secret)

    result = await db.execute(
        select(InternalApp).where(
            InternalApp.app_id == app_id,
            InternalApp.app_secret_hash == secret_hash,
            InternalApp.is_active == True
        )
    )
    app = result.scalar_one_or_none()

    if app:
        app.last_used_at = datetime.utcnow()
        app.total_requests += 1
        await db.commit()

    return app


async def get_app_by_id(db: AsyncSession, app_id: str) -> Optional[InternalApp]:
    """Get an app by its app_id"""
    result = await db.execute(
        select(InternalApp).where(InternalApp.app_id == app_id)
    )
    return result.scalar_one_or_none()


async def create_app(
    db: AsyncSession,
    app_id: str,
    name: str,
    app_type: AppType,
    description: str = "",
    team: str = "",
    owner_email: str = "",
    environment: str = "production",
    allowed_services: List[str] = None,
) -> tuple[InternalApp, str]:
    """
    Create a new internal app registration.
    Returns: (app, app_secret)
    The app_secret is only returned once and should be stored securely.
    """
    # Generate secret
    app_secret, secret_hash = generate_app_secret()

    app = InternalApp(
        app_id=app_id,
        app_secret_hash=secret_hash,
        app_secret_prefix=get_secret_prefix(app_secret),
        name=name,
        description=description,
        app_type=app_type.value if isinstance(app_type, AppType) else app_type,
        team=team,
        owner_email=owner_email,
        environment=environment,
        allowed_services=allowed_services or [],
    )

    db.add(app)
    await db.commit()

    return app, app_secret


async def regenerate_app_secret(db: AsyncSession, app_id: str) -> Optional[str]:
    """
    Regenerate the secret for an app.
    Returns the new secret (only shown once).
    """
    app = await get_app_by_id(db, app_id)
    if not app:
        return None

    app_secret, secret_hash = generate_app_secret()
    app.app_secret_hash = secret_hash
    app.app_secret_prefix = get_secret_prefix(app_secret)
    app.updated_at = datetime.utcnow()

    await db.commit()
    return app_secret


async def log_app_usage(
    db: AsyncSession,
    app_id: str,
    app_name: str,
    app_type: str,
    service: str,
    endpoint: str,
    method: str,
    status_code: int,
    response_time_ms: int,
    client_ip: str = None,
    user_agent: str = None,
    user_id: str = None,
    correlation_id: str = None,
    api_version: str = "v1",
    auto_commit: bool = True,
):
    """Log an API call from an internal app"""
    log = AppUsageLog(
        app_id=app_id,
        app_name=app_name,
        app_type=app_type,
        service=service,
        endpoint=endpoint,
        method=method,
        api_version=api_version,
        status_code=status_code,
        response_time_ms=response_time_ms,
        client_ip=client_ip,
        user_agent=user_agent,
        user_id=user_id,
        correlation_id=correlation_id,
    )
    db.add(log)
    if auto_commit:
        await db.commit()


async def get_app_usage_stats(
    db: AsyncSession,
    app_id: str = None,
    hours: int = 24
) -> dict:
    """Get usage statistics for apps"""
    from sqlalchemy import func

    cutoff = datetime.utcnow() - timedelta(hours=hours)

    query = select(
        AppUsageLog.app_id,
        AppUsageLog.app_name,
        func.count().label("total_requests"),
        func.avg(AppUsageLog.response_time_ms).label("avg_response_time"),
        func.count().filter(AppUsageLog.status_code >= 400).label("error_count"),
    ).where(
        AppUsageLog.timestamp >= cutoff
    ).group_by(
        AppUsageLog.app_id,
        AppUsageLog.app_name
    )

    if app_id:
        query = query.where(AppUsageLog.app_id == app_id)

    result = await db.execute(query)
    rows = result.fetchall()

    return [
        {
            "app_id": row.app_id,
            "app_name": row.app_name,
            "total_requests": row.total_requests,
            "avg_response_time_ms": round(row.avg_response_time, 2) if row.avg_response_time else 0,
            "error_count": row.error_count,
        }
        for row in rows
    ]


# Import timedelta for get_app_usage_stats
from datetime import timedelta
