"""Redis → `ControlEvent` мост (T008) — specs/004-candidate-interview-flow,
`contracts/control-channel.md`, `data-model.md`, раздел `ControlEvent`.

Backend не принимает решений здесь (FR-011) — только переводит `Event`
([[001-live-interview-contour]], `live-agent/src/ainterviewer/events.py`) в подмножество,
нужное кандидатскому UI, по уже зафиксированной таблице маппинга.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, TypedDict

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question

logger = logging.getLogger(__name__)

# data-model.md, «Маппинг live-agent EventType → ControlEvent.type». Остальные EventType
# (backchannel_played, candidate_utterance, live_control_decision, agent_utterance,
# interview_started) сознательно не транслируются — избыточны для UI.
_TRANSLATED_EVENT_TYPES = {
    "question_started": "question",
    "checkin_used": "checkin",
    "adaptive_question_asked": "adaptive_question",
    "question_completed": "transition",
    "interview_completed": "completed",
}

# data-model.md, «input_format по Question.format».
_INPUT_FORMAT_BY_QUESTION_FORMAT = {
    "voice": "none",
    "code_review_verbal": "none",
    "live_coding": "code",
}


class ControlEvent(TypedDict, total=False):
    type: str
    question_id: str | None
    text: str | None
    input_format: str | None
    code_language: str | None
    ts: str


def redis_channel_name(interview_id: str) -> str:
    return f"live-agent:events:{interview_id}"


async def _resolve_input_format(
    session: AsyncSession, question_id: str | None
) -> tuple[str | None, str | None]:
    """`input_format`/`code_language` выводятся из `Question.format` в Postgres, не из
    поля события live-agent (data-model.md — маппинг явно "по Question.format").

    Известное ограничение: `live-agent` сейчас читает мок-вакансию
    (`mock_data/interview_example.json`, строковые id вроде `q1`), не реальные строки
    Postgres `question` — интеграция 001↔003/004 по `question_id` ещё не сведена. Пока это
    так, лукап промахивается и мы отдаём консервативный `input_format=none`, а не роняем
    control-канал.
    """
    if question_id is None:
        return None, None
    try:
        question = await session.get(Question, question_id)
    except Exception:
        logger.warning("control_channel: question_id %s не резолвится в Postgres Question", question_id)
        question = None
    if question is None:
        return "none", None
    input_format = _INPUT_FORMAT_BY_QUESTION_FORMAT.get(question.format, "none")
    code_language = None
    if input_format == "code" and question.stimulus:
        code_language = question.stimulus.get("language")
    return input_format, code_language


async def to_control_event(session: AsyncSession, raw_event: dict[str, Any]) -> ControlEvent | None:
    """Переводит один сырой `Event` (dict из Redis) в `ControlEvent`, либо `None`, если
    этот `EventType` не транслируется UI."""
    control_type = _TRANSLATED_EVENT_TYPES.get(raw_event.get("type"))
    if control_type is None:
        return None

    question_id = raw_event.get("question_id")
    ts = raw_event.get("ts") or datetime.now(timezone.utc).isoformat()

    if control_type == "transition":
        return ControlEvent(type="transition", question_id=question_id, ts=ts)

    if control_type == "completed":
        payload_text = "Спасибо, ответы отправлены на обработку"
        return ControlEvent(type="completed", text=payload_text, ts=ts)

    input_format, code_language = await _resolve_input_format(session, question_id)
    payload = raw_event.get("payload", {})
    return ControlEvent(
        type=control_type,
        question_id=question_id,
        text=payload.get("text"),
        input_format=input_format,
        code_language=code_language,
        ts=ts,
    )


async def subscribe_raw_events(redis: Redis, interview_id: str) -> AsyncIterator[dict[str, Any]]:
    """Сырые `Event` (dict) из Redis pub/sub-канала интервью, по мере публикации
    `live-agent`-ом (`control_bridge.RedisEventSink`)."""
    pubsub = redis.pubsub()
    await pubsub.subscribe(redis_channel_name(interview_id))
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                yield json.loads(message["data"])
            except (TypeError, json.JSONDecodeError):
                logger.warning(
                    "control_channel: не-JSON сообщение в канале интервью %s, пропущено", interview_id
                )
    finally:
        await pubsub.unsubscribe(redis_channel_name(interview_id))
        await pubsub.aclose()
