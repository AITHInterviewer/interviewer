"""Подписка evaluation-agent на события live-контура через Redis pub/sub.

Live-agent публикует каждое событие в канал `live-agent:events:{interview_id}`
(`control_bridge.py`). Воркер слушает шаблон `live-agent:events:*` и реагирует
только на `interview_completed`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as redis

from evaluation_agent.config import settings

logger = logging.getLogger(__name__)

INTERVIEW_EVENTS_PATTERN = "live-agent:events:*"


def _extract_interview_id(channel: bytes | str) -> str:
    """Извлекает interview_id из имени канала `live-agent:events:{id}`."""
    channel_str = channel.decode() if isinstance(channel, bytes) else channel
    prefix = "live-agent:events:"
    if channel_str.startswith(prefix):
        return channel_str[len(prefix) :]
    return channel_str


class RedisInterviewEventListener:
    """Async Redis pub/sub listener, вызывающий callback по `interview_completed`."""

    def __init__(
        self,
        on_interview_completed: Callable[[str], Awaitable[Any]],
        redis_url: str | None = None,
    ) -> None:
        self.on_interview_completed = on_interview_completed
        self.redis_url = redis_url or settings.redis_url
        self._stop_event = asyncio.Event()
        self._redis: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None

    async def _process_message(self, message: dict[str, Any]) -> None:
        if message.get("type") not in ("pmessage", "message"):
            return
        try:
            payload = json.loads(message["data"])
        except (json.JSONDecodeError, TypeError, KeyError):
            logger.warning("Received malformed Redis message: %s", message)
            return

        if payload.get("type") != "interview_completed":
            return

        interview_id = _extract_interview_id(message.get("channel", ""))
        logger.info("Received interview_completed for %s", interview_id)
        try:
            await self.on_interview_completed(interview_id)
        except Exception:
            logger.exception("Failed to process interview %s", interview_id)

    async def run(self) -> None:
        logger.info("Connecting to Redis at %s", self.redis_url)
        self._redis = redis.from_url(self.redis_url, decode_responses=False)
        self._pubsub = self._redis.pubsub()
        await self._pubsub.psubscribe(INTERVIEW_EVENTS_PATTERN)
        logger.info("Subscribed to %s", INTERVIEW_EVENTS_PATTERN)

        try:
            while not self._stop_event.is_set():
                message = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is not None:
                    await self._process_message(message)
        finally:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()
            await self._redis.close()
            logger.info("Redis listener stopped")

    def stop(self) -> None:
        self._stop_event.set()
