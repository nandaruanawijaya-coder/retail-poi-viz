import os
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL")  # e.g. "redis://localhost:6379"

_redis = None


def _get_redis():
    global _redis
    if _redis is None and REDIS_URL:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
            logger.info("Redis connected")
        except Exception as e:
            logger.warning(f"Redis unavailable, caching disabled: {e}")
    return _redis


async def get_cached(key: str) -> Optional[Any]:
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.warning(f"Cache GET failed for key={key}: {e}")
    return None


async def set_cached(key: str, value: Any, ttl_seconds: int = 3600) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        # Pydantic models need .model_dump() before serialising
        if hasattr(value, "model_dump"):
            payload = value.model_dump()
        else:
            payload = value
        await r.setex(key, ttl_seconds, json.dumps(payload))
    except Exception as e:
        logger.warning(f"Cache SET failed for key={key}: {e}")
