"""
Data Acuity API Gateway - Database Connection
Async SQLAlchemy database setup

Supports two databases:
1. Gateway DB - API keys, usage tracking, rate limits
2. Data Warehouse - TGN ingest, analytics data
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import os

from .models import Base

# =============================================================================
# Gateway Database (API keys, usage, etc.)
# =============================================================================
DATABASE_URL = os.getenv(
    "GATEWAY_DATABASE_URL",
    "postgresql+asyncpg://gateway:gateway_secret@gateway-db:5432/api_gateway",
)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("GATEWAY_DEBUG", "false").lower() == "true",
    poolclass=NullPool,  # Better for serverless/container environments
)

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# =============================================================================
# Data Warehouse Database (TGN ingest, analytics)
# =============================================================================
# Note: Using container name. If DNS resolution fails, try using IP from:
# docker network inspect data-warehouse_data_stack | grep data_warehouse -A4
DWH_DATABASE_URL = os.getenv(
    "GATEWAY_DWH_DATABASE_URL",
    "postgresql+asyncpg://dwh_user:D%40taW%40rehou5e2025%21S3cuRe@data_warehouse:5432/datawarehouse",
)

# Data warehouse engine and session maker (lazy initialization)
_dwh_engine = None
_dwh_session_maker = None


def _get_dwh_engine():
    """Get or create data warehouse engine (lazy initialization)"""
    global _dwh_engine
    if _dwh_engine is None:
        _dwh_engine = create_async_engine(
            DWH_DATABASE_URL,
            echo=os.getenv("GATEWAY_DEBUG", "false").lower() == "true",
            poolclass=NullPool,
        )
    return _dwh_engine


def _get_dwh_session_maker():
    """Get or create data warehouse session maker (lazy initialization)"""
    global _dwh_session_maker
    if _dwh_session_maker is None:
        _dwh_session_maker = async_sessionmaker(
            _get_dwh_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _dwh_session_maker


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Close database connections"""
    await engine.dispose()
    if _dwh_engine is not None:
        await _dwh_engine.dispose()


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI routes (gateway database)"""
    async with get_session() as session:
        yield session


# =============================================================================
# Data Warehouse Session Helpers
# =============================================================================

@asynccontextmanager
async def get_dwh_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async data warehouse session"""
    session_maker = _get_dwh_session_maker()
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_dwh() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI routes (data warehouse)"""
    async with get_dwh_session() as session:
        yield session
