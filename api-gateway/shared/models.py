"""
Data Acuity API Gateway - Database Models
SQLAlchemy models for API keys, usage tracking, and analytics
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    Index,
    BigInteger,
    Float,
    JSON,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum

Base = declarative_base()


class ApiKeyStatus(enum.Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"
    SUSPENDED = "suspended"


class ApiKeyType(enum.Enum):
    INTERNAL = "internal"  # For internal service-to-service communication
    EXTERNAL = "external"  # For external client integrations
    TEST = "test"  # For testing/sandbox environments


class ApiKey(Base):
    """API Keys for external integrations"""

    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    key_prefix = Column(String(12), nullable=False)  # First 8 chars for identification

    # Owner information
    user_id = Column(String(255), nullable=False, index=True)  # Keycloak user ID
    email = Column(String(255), nullable=False, index=True)
    organization = Column(String(255), nullable=True)

    # Key metadata
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    key_type = Column(SQLEnum(ApiKeyType), default=ApiKeyType.EXTERNAL)
    status = Column(SQLEnum(ApiKeyStatus), default=ApiKeyStatus.ACTIVE)

    # Permissions and scopes
    scopes = Column(JSON, default=list)  # e.g., ["markets:read", "ai:write"]
    allowed_services = Column(JSON, default=list)  # Empty = all services
    allowed_ips = Column(JSON, default=list)  # Empty = all IPs

    # Rate limiting (overrides plan defaults)
    custom_rate_limit = Column(Integer, nullable=True)
    custom_quota = Column(Integer, nullable=True)

    # Plan association
    plan_id = Column(String(50), default="free")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    # Usage statistics
    total_requests = Column(BigInteger, default=0)

    # Relationships
    usage_records = relationship("ApiUsage", back_populates="api_key")

    __table_args__ = (
        Index("ix_api_keys_user_status", "user_id", "status"),
        Index("ix_api_keys_email_status", "email", "status"),
    )


class ServiceToken(Base):
    """Internal service-to-service authentication tokens"""

    __tablename__ = "service_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)

    # Service identification
    service_name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)

    # Permissions
    allowed_target_services = Column(JSON, default=list)  # Services this token can call
    scopes = Column(JSON, default=list)

    # Status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)


class ApiUsage(Base):
    """API usage tracking for analytics and quota enforcement"""

    __tablename__ = "api_usage"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Key identification (nullable for unauthenticated requests)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True)
    user_id = Column(String(255), nullable=True, index=True)

    # Request details
    service = Column(String(100), nullable=False, index=True)
    endpoint = Column(String(500), nullable=False)
    method = Column(String(10), nullable=False)
    api_version = Column(String(10), default="v1")

    # Response details
    status_code = Column(Integer, nullable=False)
    response_time_ms = Column(Float, nullable=False)
    response_size_bytes = Column(Integer, nullable=True)

    # Client information
    client_ip = Column(String(45), nullable=True)  # IPv6 compatible
    user_agent = Column(String(500), nullable=True)
    country = Column(String(2), nullable=True)  # ISO country code

    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    api_key = relationship("ApiKey", back_populates="usage_records")

    __table_args__ = (
        Index("ix_api_usage_service_timestamp", "service", "timestamp"),
        Index("ix_api_usage_user_timestamp", "user_id", "timestamp"),
        Index("ix_api_usage_key_timestamp", "api_key_id", "timestamp"),
    )


class QuotaUsage(Base):
    """Monthly quota tracking per user/API key"""

    __tablename__ = "quota_usage"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Identification
    user_id = Column(String(255), nullable=False, index=True)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True)

    # Period
    period = Column(String(7), nullable=False)  # YYYY-MM format

    # Usage counters
    api_calls = Column(BigInteger, default=0)
    ai_requests = Column(BigInteger, default=0)
    file_conversions = Column(BigInteger, default=0)
    data_exports = Column(BigInteger, default=0)

    # Plan at time of usage
    plan_id = Column(String(50), nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_quota_usage_user_period", "user_id", "period", unique=True),
    )


class RateLimitViolation(Base):
    """Track rate limit violations for security monitoring"""

    __tablename__ = "rate_limit_violations"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Identification
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True)
    client_ip = Column(String(45), nullable=False, index=True)
    user_id = Column(String(255), nullable=True)

    # Violation details
    service = Column(String(100), nullable=False)
    endpoint = Column(String(500), nullable=False)
    limit_type = Column(String(50), nullable=False)  # "rate" or "quota"
    limit_value = Column(Integer, nullable=False)
    current_value = Column(Integer, nullable=False)

    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (Index("ix_rate_limit_ip_timestamp", "client_ip", "timestamp"),)


class WebhookLog(Base):
    """Log of webhook deliveries for usage notifications"""

    __tablename__ = "webhook_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Target
    user_id = Column(String(255), nullable=False, index=True)
    webhook_url = Column(String(500), nullable=False)

    # Event
    event_type = Column(String(100), nullable=False)  # quota_warning, quota_exceeded, etc.
    payload = Column(JSON, nullable=False)

    # Response
    status_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    success = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    delivered_at = Column(DateTime, nullable=True)
