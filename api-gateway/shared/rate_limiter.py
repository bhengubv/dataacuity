"""
Data Acuity API Gateway - Rate Limiting
Redis-based rate limiting with sliding window algorithm
"""

import time
from typing import Optional, Tuple
from datetime import datetime
import redis.asyncio as redis
import os

from .config import PLAN_QUOTAS


class RateLimiter:
    """
    Sliding window rate limiter using Redis
    Supports both per-second rate limits and monthly quotas
    """

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or os.getenv(
            "GATEWAY_REDIS_URL", "redis://gateway-redis:6379/0"
        )
        self._redis: Optional[redis.Redis] = None

    async def connect(self):
        """Initialize Redis connection"""
        if not self._redis:
            self._redis = redis.from_url(
                self.redis_url, encoding="utf-8", decode_responses=True
            )

    async def close(self):
        """Close Redis connection"""
        if self._redis:
            await self._redis.close()

    async def check_rate_limit(
        self,
        identifier: str,
        limit: int,
        window: int = 60,
        cost: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Check and increment rate limit using sliding window.

        Args:
            identifier: Unique identifier (e.g., API key, IP)
            limit: Maximum requests allowed in window
            window: Time window in seconds
            cost: Cost of this request (default 1)

        Returns:
            (allowed, remaining, reset_time)
        """
        await self.connect()

        now = time.time()
        key = f"rate_limit:{identifier}"

        pipe = self._redis.pipeline()

        # Remove old entries outside the window
        pipe.zremrangebyscore(key, 0, now - window)

        # Count current requests in window
        pipe.zcard(key)

        # Add current request with current timestamp as score
        pipe.zadd(key, {f"{now}:{cost}": now})

        # Set expiry on the key
        pipe.expire(key, window)

        results = await pipe.execute()
        current_count = results[1]

        # Calculate remaining
        remaining = max(0, limit - current_count - cost)
        reset_time = int(now + window)

        allowed = current_count + cost <= limit

        return allowed, remaining, reset_time

    async def check_quota(
        self,
        user_id: str,
        quota_type: str,
        plan_id: str = "free",
        increment: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Check and increment monthly quota.

        Args:
            user_id: User identifier
            quota_type: Type of quota (api_calls, ai_requests, etc.)
            plan_id: User's plan ID
            increment: Amount to increment

        Returns:
            (allowed, remaining, limit)
        """
        await self.connect()

        # Get plan limits
        plan = PLAN_QUOTAS.get(plan_id, PLAN_QUOTAS["free"])
        limit = plan.get(quota_type, 0)

        # -1 means unlimited
        if limit == -1:
            return True, -1, -1

        # Monthly key
        period = datetime.utcnow().strftime("%Y-%m")
        key = f"quota:{user_id}:{quota_type}:{period}"

        # Get current usage
        current = await self._redis.get(key)
        current_count = int(current) if current else 0

        if current_count + increment > limit:
            return False, max(0, limit - current_count), limit

        # Increment
        new_count = await self._redis.incr(key)

        # Set expiry to end of month + 1 day (for safety)
        await self._redis.expire(key, 32 * 24 * 60 * 60)

        remaining = max(0, limit - new_count)
        return True, remaining, limit

    async def get_quota_usage(self, user_id: str, plan_id: str = "free") -> dict:
        """Get current quota usage for all quota types"""
        await self.connect()

        period = datetime.utcnow().strftime("%Y-%m")
        plan = PLAN_QUOTAS.get(plan_id, PLAN_QUOTAS["free"])

        usage = {}
        for quota_type, limit in plan.items():
            if quota_type == "rate_limit_multiplier":
                continue

            key = f"quota:{user_id}:{quota_type}:{period}"
            current = await self._redis.get(key)
            current_count = int(current) if current else 0

            usage[quota_type] = {
                "used": current_count,
                "limit": limit,
                "remaining": limit - current_count if limit != -1 else -1,
                "unlimited": limit == -1,
            }

        return usage

    async def reset_rate_limit(self, identifier: str):
        """Reset rate limit for an identifier (admin function)"""
        await self.connect()
        key = f"rate_limit:{identifier}"
        await self._redis.delete(key)

    async def get_rate_limit_status(self, identifier: str, window: int = 60) -> dict:
        """Get current rate limit status"""
        await self.connect()

        now = time.time()
        key = f"rate_limit:{identifier}"

        # Remove old entries and count
        pipe = self._redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zcard(key)
        results = await pipe.execute()

        return {
            "current_requests": results[1],
            "window_seconds": window,
        }


# Singleton instance
rate_limiter = RateLimiter()
