"""Durable Redis Stream consumer for live-agent events.

The browser WebSocket relays ephemeral Pub/Sub messages. This consumer owns persistence
and evaluation-job creation, so either can restart without losing completed interviews.
"""

from __future__ import annotations

import asyncio
import json
import logging

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from app.db import SessionLocal
from app.services.interview_event_service import InterviewEventService

logger = logging.getLogger(__name__)

EVENT_STREAM_NAME = "live-agent:events"
CONSUMER_GROUP = "backend"


def _decode(value: bytes | str) -> str:
    return value.decode() if isinstance(value, bytes) else value


class LiveEventConsumer:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        # A stable consumer name lets a restarted single backend instance resume its own
        # pending entries before requesting newly appended events.
        self.consumer_name = "backend"

    async def ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(EVENT_STREAM_NAME, CONSUMER_GROUP, id="0", mkstream=True)
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def process_entry(self, entry_id: bytes | str, fields: dict[bytes | str, bytes | str]) -> None:
        normalized = {_decode(key): _decode(value) for key, value in fields.items()}
        try:
            raw_event = json.loads(normalized["payload"])
            async with SessionLocal() as session:
                await InterviewEventService(session).record_event(
                    normalized["interview_id"], raw_event, source_event_id=_decode(entry_id)
                )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            logger.exception("Discarding malformed live event %s", _decode(entry_id))
            await self.redis.xack(EVENT_STREAM_NAME, CONSUMER_GROUP, entry_id)
        else:
            await self.redis.xack(EVENT_STREAM_NAME, CONSUMER_GROUP, entry_id)

    async def run(self) -> None:
        while True:
            try:
                await self.ensure_group()
                break
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Could not initialize live event consumer; retrying")
                await asyncio.sleep(1)

        # Resume entries left pending if this backend instance stopped after reading but
        # before committing and acknowledging them.
        while True:
            try:
                pending = await self.redis.xreadgroup(
                    CONSUMER_GROUP, self.consumer_name, {EVENT_STREAM_NAME: "0"}, count=10
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Could not resume pending live events; retrying")
                await asyncio.sleep(1)
                continue
            if not pending:
                break
            for _stream, messages in pending:
                for entry_id, fields in messages:
                    await self.process_entry(entry_id, fields)
        while True:
            try:
                entries = await self.redis.xreadgroup(
                    CONSUMER_GROUP,
                    self.consumer_name,
                    {EVENT_STREAM_NAME: ">"},
                    count=10,
                    block=1000,
                )
                for _stream, messages in entries:
                    for entry_id, fields in messages:
                        await self.process_entry(entry_id, fields)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Live event consumer failed; retrying")
                await asyncio.sleep(1)
            await asyncio.sleep(0)
