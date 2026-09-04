"""Кандидатские REST-эндпоинты (specs/004-candidate-interview-flow):
consent-info (`contracts/consent-info.md`) и LiveKit-токен (`contracts/livekit-token.md`).
WS control-канал — `interview_ws.py`; answer-upload — не реализован (T020/T021).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.services.interview_repository import build_consent_info, get_interview_by_access_token
from app.services.livekit_tokens import LiveKitTokenResponse, issue_candidate_token

router = APIRouter(tags=["candidate-interview"])


@router.get("/interview/{access_token}")
async def get_interview_consent_info(access_token: str, session: AsyncSession = Depends(get_db)) -> dict:
    interview = await get_interview_by_access_token(session, access_token)
    if interview is None:
        raise HTTPException(status_code=404, detail="interview not found")
    return dict(await build_consent_info(session, interview))


@router.post("/interview/{access_token}/livekit-token")
async def get_livekit_token(
    access_token: str, session: AsyncSession = Depends(get_db)
) -> LiveKitTokenResponse:
    interview = await get_interview_by_access_token(session, access_token)
    if interview is None:
        raise HTTPException(status_code=404, detail="interview not found")
    if interview.status == "completed":
        raise HTTPException(status_code=409, detail="interview already completed")
    return issue_candidate_token(str(interview.id))
