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
        # Единственный тип сообщения от кандидата в этом канале — `candidate_input`
        # (contracts/control-channel.md). Пересылка в сторону live-agent-моста — T028,
        # ещё не реализована; здесь MVP-персистенция (`record_candidate_input`) —
        # см. план, «Recording depth: MVP».
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("interview_ws: не-JSON сообщение от кандидата, интервью %s", interview_id)
                continue
            if message.get("type") != "candidate_input":
                continue
            async with SessionLocal() as session:
                await InterviewEventService(session).record_candidate_input(interview_id, message)
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await relay_task
        await redis.aclose()


async def _relay_control_events(websocket: WebSocket, redis: Redis, interview_id: str) -> None:
    async with SessionLocal() as session:
        event_service = InterviewEventService(session)
        async for raw_event in subscribe_raw_events(redis, interview_id):
            await event_service.record_event(interview_id, raw_event)
            control_event = await to_control_event(session, raw_event)
            if control_event is None:
                continue
            await websocket.send_json(control_event)
            if control_event["type"] == "completed":
                await websocket.close(code=1000)
                return
