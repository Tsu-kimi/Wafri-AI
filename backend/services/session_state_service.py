"""
backend/services/session_state_service.py

Minimal session state helper retained for PIN reset flow compatibility.

All session state is now ACTIVE — there is no AWAITING_PIN or LOCKED state
since the login page handles authentication before any WebSocket session starts.
The Redis key is kept for future use but is not actively checked by the bridge.
"""
from __future__ import annotations

import logging

from backend.services.redis_client import get_redis

log = logging.getLogger("wafrivet.services.session_state")

_KEY_PREFIX = "session_state:"
SESSION_STATE_TTL_SECONDS: int = 90_000  # 25 hours


def _key(session_id: str) -> str:
    return f"{_KEY_PREFIX}{session_id}"


async def transition_to_active(session_id: str) -> None:
    """Mark a session as ACTIVE in Redis (called after successful PIN reset)."""
    redis = get_redis()
    await redis.setex(_key(session_id), SESSION_STATE_TTL_SECONDS, "ACTIVE")
    log.info("session_activated", extra={"session_id": session_id})
