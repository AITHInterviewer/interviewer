"""
Аддитивный мост live-контура к control-каналу кандидатского UI
(specs/004-candidate-interview-flow) — НЕ часть протокола `EventLog` (`events.py`),
не меняет его формат и не заменяет файловый `out/<interview_id>.jsonl`
(`live-agent/CLAUDE.md`, правило 5). `RedisEventSink` реализует `events.EventSink` и
публикует ТОТ ЖЕ `Event`, что уже уходит в файл, в Redis pub/sub-канал
`live-agent:events:{interview_id}` для UI и добавляет то же событие в Redis Stream для
надёжного backend-потребителя. Backend сам решает, что показать кандидату; live-agent
никакой UI-семантики не знает и знать не должен.

Почему pub/sub, а не прямой вызов backend — см.
`specs/004-candidate-interview-flow/research.md`, пункт 2.
"""

from __future__ import annotations

import logging

from redis.asyncio import Redis

from .events import Event, EventSink

logger = logging.getLogger(__name__)


def redis_channel_name(interview_id: str) -> str:
    return f"live-agent:events:{interview_id}"


EVENT_STREAM_NAME = "live-agent:events"


class RedisEventSink(EventSink):
    """Публикует события одного интервью в Redis pub/sub. Синхронный `publish()` (контракт
    `EventSink`) — под капотом планирует асинхронную публикацию на текущем event loop, т.к.
    `EventLog.emit()` вызывается из синхронного и асинхронного кода `state_machine.py`/
    `agent.py` без единообразия — см. `_schedule`."""

    def __init__(self, redis: Redis, interview_id: str):
        self._redis = redis
        self._channel = redis_channel_name(interview_id)

    def publish(self, event: Event) -> None:
        import asyncio

        payload = event.to_jsonl()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # Нет активного event loop (например, синхронный вызов из тестов/скриптов) —
            # публикация в Redis необязательна для работы графа (см. events.py, docstring
            # EventSink), просто пропускаем, не блокируем синхронный код на asyncio.run().
            logger.warning("RedisEventSink.publish() без активного event loop — событие %s пропущено", event.type)
            return
        loop.create_task(self._publish_async(payload))

    async def _publish_async(self, payload: str) -> None:
        await self._redis.publish(self._channel, payload)
        await self._redis.xadd(
            EVENT_STREAM_NAME,
            {"interview_id": self._channel.removeprefix("live-agent:events:"), "payload": payload},
        )
