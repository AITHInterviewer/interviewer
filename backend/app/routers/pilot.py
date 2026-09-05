from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import require_any_capability, require_capability
from app.models.user import InternalUser
from app.repositories.question_repository import QuestionRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.roles.catalog import AREA_EXPERT_QUESTIONS, AREA_HIRING_MANAGER_REVIEW, AREA_RECRUITER_WORKSPACE
from app.schemas.interview import InterviewResponse
from app.schemas.vacancy import VacancyResponse
from app.services.pilot_service import PilotError, PilotService
from app.services.vacancy_service import VacancyService

router = APIRouter(prefix="/api/v1", tags=["pilot"])

require_recruiter = require_capability(AREA_RECRUITER_WORKSPACE)
require_manager = require_capability(AREA_HIRING_MANAGER_REVIEW)
require_expert = require_capability(AREA_EXPERT_QUESTIONS)
require_staff_reader = require_any_capability(AREA_RECRUITER_WORKSPACE, AREA_EXPERT_QUESTIONS)


def get_pilot(session: Annotated[AsyncSession, Depends(get_db_session)]) -> PilotService:
    return PilotService(session)


class CloseBody(BaseModel):
    reason: str = Field(min_length=1)


class HandoffBody(BaseModel):
    to_manager_id: UUID
    summary: str = Field(min_length=1)


class OpinionBody(BaseModel):
    manager_id: UUID


def _raise(exc: PilotError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/interviews/{interview_id}/extra")
async def request_extra(
    interview_id: UUID,
    actor: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    try:
        item = await service.request_extra(interview_id, actor.id)
    except PilotError as exc:
        _raise(exc)
    return {
        "id": str(item.id),
        "interview_id": str(item.interview_id),
        "type": item.type,
        "status": item.status,
        "extra_token": item.extra_token,
    }


@router.post("/interviews/{interview_id}/audit")
async def request_audit(
    interview_id: UUID,
    actor: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    try:
        item = await service.request_audit(interview_id, actor.id)
    except PilotError as exc:
        _raise(exc)
    return {
        "id": str(item.id),
        "interview_id": str(item.interview_id),
        "type": item.type,
        "status": item.status,
    }


@router.post("/interviews/{interview_id}/clarifications/{clarification_id}/close")
async def close_clarification(
    interview_id: UUID,
    clarification_id: UUID,
    payload: CloseBody,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    try:
        item = await service.close_clarification(interview_id, clarification_id, payload.reason)
    except PilotError as exc:
        _raise(exc)
    return {"id": str(item.id), "status": item.status, "close_reason": item.close_reason}


@router.post("/interviews/{interview_id}/handoff")
async def handoff(
    interview_id: UUID,
    payload: HandoffBody,
    actor: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    try:
        row = await service.handoff(interview_id, actor.id, payload.to_manager_id, payload.summary)
    except PilotError as exc:
        _raise(exc)
    return {"id": str(row.id)}


@router.post("/interviews/{interview_id}/opinion-grant")
async def opinion_grant(
    interview_id: UUID,
    payload: OpinionBody,
    actor: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    try:
        row = await service.grant_opinion(interview_id, actor.id, payload.manager_id)
    except PilotError as exc:
        _raise(exc)
    return {"id": str(row.id)}


def _manager_item(row: dict) -> dict[str, Any]:
    return {
        "interview": InterviewResponse.model_validate(row["interview"]).model_dump(mode="json"),
        "vacancy_title": row["vacancy_title"],
        "handed_off_at": row["handed_off_at"].isoformat() if row["handed_off_at"] else None,
        "from_recruiter_name": row["from_recruiter_name"],
        "summary": row["summary"],
        "access": row["access"],
    }


def _clarification_payload(item) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "interview_id": str(item.interview_id),
        "type": item.type,
        "status": item.status,
        "close_reason": item.close_reason,
        "extra_token": item.extra_token,
    }


@router.get("/interviews/{interview_id}/clarifications")
async def list_clarifications(
    interview_id: UUID,
    _: Annotated[InternalUser, Depends(require_staff_reader)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    try:
        items = await service.list_clarifications(interview_id)
    except PilotError as exc:
        _raise(exc)
    return {"items": [_clarification_payload(item) for item in items]}


@router.get("/staff/hiring-managers")
async def hiring_managers(
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    users = await service.list_hiring_managers()
    return {"items": [{"id": str(user.id), "name": user.name, "email": user.email} for user in users]}


@router.get("/manager/candidates")
async def manager_candidates(
    actor: Annotated[InternalUser, Depends(require_manager)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    items = await service.list_manager_candidates(actor.id)
    return {"items": [_manager_item(item) for item in items]}


@router.get("/manager/candidates/{interview_id}")
async def manager_candidate(
    interview_id: UUID,
    actor: Annotated[InternalUser, Depends(require_manager)],
    service: Annotated[PilotService, Depends(get_pilot)],
) -> dict[str, Any]:
    if not await service.manager_can_view(interview_id, actor.id):
        raise HTTPException(status_code=403, detail="No access to this candidate.")
    items = await service.list_manager_candidates(actor.id)
    match = next((item for item in items if item["interview"].id == interview_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return _manager_item(match)


@router.get("/expert/queue")
async def expert_queue(
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[PilotService, Depends(get_pilot)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, Any]:
    payload = await service.expert_queue()
    vacancy_service = VacancyService(VacancyRepository(session), QuestionRepository(session))
    calibrations = []
    for vacancy in payload["calibrations"]:
        questions = await vacancy_service.list_questions(vacancy.id)
        calibrations.append(VacancyResponse.from_model(vacancy, questions).model_dump(mode="json"))
    audits = [
        {
            "interview": InterviewResponse.model_validate(item["interview"]).model_dump(mode="json"),
            "vacancy_id": str(item["vacancy_id"]),
            "vacancy_title": item["vacancy_title"],
        }
        for item in payload["audits"]
    ]
    return {"calibrations": calibrations, "audits": audits}
