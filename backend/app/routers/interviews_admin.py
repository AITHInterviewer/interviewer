"""specs/004-candidate-interview-flow — просмотр интервью/событий рекрутёром (MVP-отладка,
план `kind-fluttering-reef.md`, «Backend: new routers»)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import require_capability
from app.models.answer import Answer
from app.models.interview_event import InterviewEvent
from app.models.question import Question
from app.models.user import InternalUser
from app.roles.catalog import AREA_RECRUITER_WORKSPACE
from app.schemas.interview import (
    AnswerResponse,
    InterviewEventResponse,
    InterviewEventsResponse,
    InterviewResponse,
)
from app.services.interview_admin_service import InterviewAdminService

router = APIRouter(prefix="/api/v1/interviews", tags=["interviews"])

require_recruiter = require_capability(AREA_RECRUITER_WORKSPACE)


def get_interview_admin_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InterviewAdminService:
    return InterviewAdminService(session)


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
) -> InterviewResponse:
    interview = await service.get_interview(interview_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
    return InterviewResponse.model_validate(interview)


@router.get("/{interview_id}/events", response_model=InterviewEventsResponse)
async def get_interview_events(
    interview_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InterviewEventsResponse:
    interview = await service.get_interview(interview_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    events_result = await session.execute(
        select(InterviewEvent)
        .where(InterviewEvent.interview_id == interview_id)
        .order_by(InterviewEvent.created_at.asc())
    )
    answers_result = await session.execute(
        select(Answer).where(Answer.interview_id == interview_id).order_by(Answer.started_at.asc())
    )
    answers = answers_result.scalars().all()

    questions_result = await session.execute(
        select(Question.id, Question.text).where(Question.id.in_([answer.question_id for answer in answers]))
    )
    question_text_by_id = dict(questions_result.all())

    return InterviewEventsResponse(
        interview=InterviewResponse.model_validate(interview),
        events=[InterviewEventResponse.model_validate(event) for event in events_result.scalars().all()],
        answers=[
            AnswerResponse(
                **AnswerResponse.model_validate(answer).model_dump(exclude={"question_text"}),
                question_text=question_text_by_id.get(answer.question_id),
            )
            for answer in answers
        ],
    )
