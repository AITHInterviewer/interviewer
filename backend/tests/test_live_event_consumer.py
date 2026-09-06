"""`LiveEventConsumer.run`: регрессия на реальный баг 2026-09-06 — resume-цикл с пустым
PEL никогда не завершался (redis-py возвращает [(stream, [])], а не пустой список),
консьюмер бесконечно крутил чтение "0" и не доходил до основного чтения ">" —
события копились в lag, в логах тишина.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest

from app.services.live_event_consumer import CONSUMER_GROUP, EVENT_STREAM_NAME, LiveEventConsumer


class _FakeRedis:
    """Минимальный стенд redis-py: чтение "0" по пустому PEL, затем новые записи по ">"."""

    def __init__(self, entries: list[tuple[str, dict[str, str]]]) -> None:
        self._entries = entries
        self.xreadgroup_calls: list[str] = []
        self.acked: list[str] = []

    async def xgroup_create(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    async def xreadgroup(
        self,
        _group: str,
        _consumer: str,
        streams: dict[str, str],
        count: int | None = None,
        block: int | None = None,
    ) -> Any:
        read_id = streams[EVENT_STREAM_NAME]
        self.xreadgroup_calls.append(read_id)
        # Имитация реального I/O-ожидания: без yield фейк не отдаёт управление event
        # loop, и тестовый ожидатель никогда не просыпается.
        await asyncio.sleep(0)
        if read_id == "0":
            # Точка бага: пустой PEL возвращается как [(stream, [])], не как [] / None.
            return [(EVENT_STREAM_NAME, [])]
        if self._entries:
            entries = self._entries
            self._entries = []
            return [(EVENT_STREAM_NAME, entries)]
        return None  # таймаут block

    async def xack(self, _stream: str, _group: str, entry_id: str) -> None:
        self.acked.append(entry_id)


class _CollectingConsumer(LiveEventConsumer):
    def __init__(self, redis: _FakeRedis) -> None:
        super().__init__(redis)  # type: ignore[arg-type]
        self.processed: list[str] = []

    async def process_entry(self, entry_id: bytes | str, fields: dict[bytes | str, bytes | str]) -> None:
        self.processed.append(str(entry_id))
        await self.redis.xack(EVENT_STREAM_NAME, CONSUMER_GROUP, str(entry_id))


@pytest.mark.anyio
async def test_empty_pending_list_does_not_stall_consumer() -> None:
    entry_id = str(uuid.uuid4())
    redis = _FakeRedis(entries=[(entry_id, {"interview_id": str(uuid.uuid4()), "payload": "{}"})])
    consumer = _CollectingConsumer(redis)

    task = asyncio.create_task(consumer.run())
    try:
        for _ in range(200):
            if redis.acked:
                break
            await asyncio.sleep(0.01)
    finally:
        task.cancel()

    assert redis.acked == [entry_id], 'новая запись должна быть прочитана по ">" и ack-нута'
    assert ">" in redis.xreadgroup_calls, 'после пустого PEL консьюмер должен дойти до чтения ">"'
    assert consumer.processed == [entry_id]
    # Раньше баг: крутились только чтения "0" и дальше не шли.
    assert len([c for c in redis.xreadgroup_calls if c == "0"]) <= 2
