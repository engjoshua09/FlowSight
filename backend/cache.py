"""
FlowSight — Redis Caching Layer
backend/app/cache.py

Caches raw Tradier options chain responses (before Greeks/UOA computation)
with a 5-minute TTL. Gracefully degrades if Redis is unavailable —
the app continues to work, just without caching.

TTL rationale: Tradier sandbox refreshes ~every 5 min; live market data
is stale faster, but we don't want to hammer the free tier rate limit.
Adjust CACHE_TTL_SECONDS for your use case.
"""

import json
import logging
import os
from functools import wraps
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", 300))  # 5 min default
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Module-level client — created once on startup, reused across requests.
# None if Redis is unavailable (graceful degradation).
_redis: aioredis.Redis | None = None


async def init_cache() -> None:
    """
    Call this in FastAPI's lifespan startup block.
    Sets the module-level _redis client. Logs a warning (not an exception)
    if Redis is unreachable so the app still boots in environments without it.
    """
    global _redis
    try:
        client = aioredis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,  # fail fast if Redis is down
        )
        await client.ping()
        _redis = client
        logger.info("Redis connected at %s", REDIS_URL)
    except Exception as exc:
        logger.warning("Redis unavailable — running without cache. Reason: %s", exc)
        _redis = None


async def close_cache() -> None:
    """Call this in FastAPI's lifespan shutdown block."""
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        logger.info("Redis connection closed.")


# ─── Low-level get/set/delete ────────────────────────────────────────────────


async def cache_get(key: str) -> Any | None:
    """
    Returns the deserialised value for `key`, or None on miss / Redis down.
    """
    if _redis is None:
        return None
    try:
        raw = await _redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("cache_get(%s) failed: %s", key, exc)
        return None


async def cache_set(key: str, value: Any, ttl: int = CACHE_TTL_SECONDS) -> None:
    """
    Serialises `value` to JSON and stores it under `key` with a TTL.
    Silent no-op if Redis is down.
    """
    if _redis is None:
        return
    try:
        await _redis.set(key, json.dumps(value), ex=ttl)
    except Exception as exc:
        logger.warning("cache_set(%s) failed: %s", key, exc)


async def cache_delete(key: str) -> None:
    """Evict a specific key (useful for manual cache busting)."""
    if _redis is None:
        return
    try:
        await _redis.delete(key)
    except Exception as exc:
        logger.warning("cache_delete(%s) failed: %s", key, exc)


# ─── Convenience: cache key builders ─────────────────────────────────────────


def options_chain_key(ticker: str) -> str:
    """Canonical cache key for a ticker's raw options chain."""
    return f"flowsight:options_chain:{ticker.upper()}"


def uoa_key(ticker: str) -> str:
    """Canonical cache key for a ticker's computed UOA scores."""
    return f"flowsight:uoa:{ticker.upper()}"


# ─── Cache-aside decorator (optional, for future use) ────────────────────────


def cached(key_fn, ttl: int = CACHE_TTL_SECONDS):
    """
    Async decorator that implements cache-aside pattern.

    Usage:
        @cached(lambda ticker: options_chain_key(ticker))
        async def fetch_chain(ticker: str) -> dict:
            ...

    The decorated function is only called on a cache miss.
    The return value must be JSON-serialisable.
    """

    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            key = key_fn(*args, **kwargs)
            hit = await cache_get(key)
            if hit is not None:
                logger.debug("Cache HIT: %s", key)
                return hit
            logger.debug("Cache MISS: %s", key)
            result = await fn(*args, **kwargs)
            if result is not None:
                await cache_set(key, result, ttl)
            return result

        return wrapper

    return decorator


SNAPSHOT_TTL_SECONDS = int(os.getenv("SNAPSHOT_TTL_SECONDS", 60 * 60 * 100))  # ~4 days


def snapshot_key(ticker: str) -> str:
    """Cache key for the last full snapshot captured during market hours."""
    return f"flowsight:snapshot:{ticker.upper()}"
