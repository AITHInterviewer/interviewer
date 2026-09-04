"""
Кандидатские REST-эндпоинты (specs/004-candidate-interview-flow). Пока только
consent-screen-инфо (`contracts/consent-info.md`) — WS control-канал
(`contracts/control-channel.md`), выпуск LiveKit-токена (`contracts/livekit-token.md`) и
answer-upload (`contracts/answer-upload.md`) заблокированы на готовности
[[003-recruiter-vacancy-management]] (нет ни `Interview`-модели, ни DB-сессии в backend —
см. `specs/004-candidate-interview-flow/tasks.md`, Foundational, T004/T007-T009/T011) и
не реализованы в этом файле, чтобы не подделывать несуществующую DB-схему.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.interview_directory import get_interview_by_access_token

router = APIRouter(tags=["candidate-interview"])


@router.get("/interview/{access_token}")
async def get_interview_consent_info(access_token: str) -> dict:
    interview = get_interview_by_access_token(access_token)
    if interview is None:
        raise HTTPException(status_code=404, detail="interview not found")
    return dict(interview)
