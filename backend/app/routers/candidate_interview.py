"""Кандидатские REST-эндпоинты (specs/004-candidate-interview-flow):
consent-info (`contracts/consent-info.md`) и LiveKit-токен (`contracts/livekit-token.md`).
WS control-канал — `interview_ws.py`; answer-upload — не реализован (T020/T021).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.services.interview_repository import build_consent_info, get_interview_by_access_token
from app.services.livekit_tokens import LiveKitTokenResponse, issue_candidate_token
from app.services.pilot_service import PilotError, PilotService

router = APIRouter(tags=["candidate-interview"])


class ProgressBody(BaseModel):
    product_state: str


@router.get("/interview/{access_token}")
async def get_interview_consent_info(access_token: str, session: AsyncSession = Depends(get_db)) -> dict:
    interview = await get_interview_by_access_token(session, access_token)
    if interview is None:
        raise HTTPException(status_code=404, detail="interview not found")
    payload = dict(await build_consent_info(session, interview))
    payload["product_state"] = interview.product_state
    payload["consented"] = interview.consented_at is not None
    return payload


@router.post("/interview/{access_token}/consent")
async def post_interview_consent(access_token: str, session: AsyncSession = Depends(get_db)) -> dict:
    try:
        interview = await PilotService(session).mark_consent(access_token)
    except PilotError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return {"product_state": interview.product_state, "consented": interview.consented_at is not None}


class ExtraAnswerBody(BaseModel):
    answer: str = ""


@router.get("/interview/{access_token}/extra/{extra_id}")
async def get_extra_request(
    access_token: str, extra_id: str, session: AsyncSession = Depends(get_db)
) -> dict:
    try:
        item = await PilotService(session).extra_for_token(access_token, extra_id)
    except PilotError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return {
        "id": str(item.id),
        "status": item.status,
        "extra_token": item.extra_token,
    }


@router.post("/interview/{access_token}/extra/{extra_id}")
async def submit_extra_request(
    access_token: str,
    extra_id: str,
    payload: ExtraAnswerBody,
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        item = await PilotService(session).submit_extra(access_token, extra_id, payload.answer)
    except PilotError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return {"id": str(item.id), "status": item.status}


@router.post("/interview/{access_token}/progress")
async def post_interview_progress(
    access_token: str, payload: ProgressBody, session: AsyncSession = Depends(get_db)
) -> dict:
    try:
        interview = await PilotService(session).mark_progress(access_token, payload.product_state)
    except PilotError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return {"product_state": interview.product_state}


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
