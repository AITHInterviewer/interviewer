"""Control-канал (T007) — specs/004-candidate-interview-flow/contracts/control-channel.md.

Единственная точка входа кандидатского UI в backend (FR-009). Держит соединение открытым
весь сеанс интервью, параллельно с LiveKit (не переоткрывается при подключении LiveKit —
см. spec.md, «Механизм доставки событий», обновление от 2026-09-04).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.config import settings
from app.db import SessionLocal
from app.services.control_channel import subscribe_raw_events, to_control_event
from app.services.interview_event_service import InterviewEventService
from app.services.interview_repository import get_interview_by_access_token

logger = logging.getLogger(__name__)
router = APIRouter()

_CLOSE_INVALID_TOKEN = 4401
_CLOSE_ALREADY_COMPLETED = 4409


@router.websocket("/api/ws/interview/{access_token}")
async def interview_control_channel(websocket: WebSocket, access_token: str) -> None:
    async with SessionLocal() as session:
        interview = await get_interview_by_access_token(session, access_token)

    if interview is None:
        await websocket.close(code=_CLOSE_INVALID_TOKEN)
        return
    if interview.status == "completed":
        await websocket.close(code=_CLOSE_ALREADY_COMPLETED)
        return

    await websocket.accept()
    interview_id = str(interview.id)
    redis = Redis.from_url(settings.redis_url)

    relay_task = asyncio.create_task(_relay_control_events(websocket, redis, interview_id))
    try:
        # От кандидата в этом канале два типа сообщений: `candidate_input`
        # (contracts/control-channel.md; пересылка в сторону live-agent-моста — T028, ещё
        # не реализована, здесь MVP-персистенция) и `security_signal` — блок безопасности
        # на карточке кандидата (переключение вкладки/камера, см. control-channel.ts на
        # фронте), только логирование, без агрегации в Answer.
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("interview_ws: не-JSON сообщение от кандидата, интервью %s", interview_id)
                continue
            message_type = message.get("type")
            async with SessionLocal() as session:
                if message_type == "candidate_input":
                    await InterviewEventService(session).record_candidate_input(interview_id, message)
                    # live_coding: помимо персистентности выше, тот же код должен доехать live-agent
                    # вживую (specs/004-candidate-interview-flow/tasks.md, "Известный gap" US4) —
                    # переиспользуем существующий командный канал "Дальше", не заводим новый.
                    if message.get("input_format") == "code":
                        await redis.publish(
                            f"live-agent:commands:{interview_id}",
                            json.dumps({"type": "code_update", "content": message.get("content", "")}),
                        )
                elif message_type == "security_signal":
                    await InterviewEventService(session).record_security_signal(interview_id, message)
            # Кнопка «Дальше» на карточке кандидата — просто просим live-agent завершить
            # текущий вопрос. Решение принимает граф live-контура (FR-011), backend только
            # передаёт команду в его канал.
            if message_type == "next_question":
                await redis.publish(
                    f"live-agent:commands:{interview_id}", json.dumps({"type": "skip"})
                )
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await relay_task
        await redis.aclose()


async def _relay_control_events(websocket: WebSocket, redis: Redis, interview_id: str) -> None:
    async with SessionLocal() as session:
        async for raw_event in subscribe_raw_events(redis, interview_id):
            control_event = await to_control_event(session, raw_event)
            if control_event is None:
                continue
            await websocket.send_json(control_event)
            if control_event["type"] == "completed":
                await websocket.close(code=1000)
                return
