"""specs/004-candidate-interview-flow — просмотр интервью/событий рекрутёром (MVP-отладка,
план `kind-fluttering-reef.md`, «Backend: new routers»)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import require_any_capability, require_capability
from app.dependencies.live_agent_auth import require_live_agent_token
from app.models.answer import Answer
from app.models.interview import Interview
from app.models.interview_event import InterviewEvent
from app.models.question import Question
from app.models.user import InternalUser
from app.models.vacancy import Vacancy
from app.roles.catalog import AREA_EXPERT_QUESTIONS, AREA_RECRUITER_WORKSPACE
from app.schemas.interview import (
    AnswerResponse,
    InterviewEventResponse,
    InterviewEventsResponse,
    InterviewResponse,
)
from app.schemas.live_input import LiveInputCandidate, LiveInputQuestion, LiveInputResponse, LiveInputVacancy
from app.services.interview_admin_service import InterviewAdminService

router = APIRouter(prefix="/api/v1/interviews", tags=["interviews"])

require_recruiter = require_capability(AREA_RECRUITER_WORKSPACE)
require_interview_reader = require_any_capability(AREA_RECRUITER_WORKSPACE, AREA_EXPERT_QUESTIONS)


def get_interview_admin_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InterviewAdminService:
    return InterviewAdminService(session)


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: UUID,
    _: Annotated[InternalUser, Depends(require_interview_reader)],
    service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
) -> InterviewResponse:
    interview = await service.get_interview(interview_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
    return InterviewResponse.model_validate(interview)


@router.get("/{interview_id}/events", response_model=InterviewEventsResponse)
async def get_interview_events(
    interview_id: UUID,
    _: Annotated[InternalUser, Depends(require_interview_reader)],
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


@router.get(
    "/{interview_id}/live-input",
    response_model=LiveInputResponse,
    dependencies=[Depends(require_live_agent_token)],
)
async def get_live_input(
    interview_id: UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> LiveInputResponse:
    """Форма `InterviewInput` для `live-agent` (план `kind-fluttering-reef.md`, раздел 3) —
    вакансия + базовые вопросы (`interview_id IS NULL`), отсортированные по `question.order`:
    `live-agent` идёт по списку по индексу и никогда не пересортирует."""
    interview = await session.get(Interview, interview_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    vacancy = await session.get(Vacancy, interview.vacancy_id)
    assert vacancy is not None  # FK not null — гарантировано схемой

    questions_result = await session.execute(
        select(Question)
        .where(Question.vacancy_id == interview.vacancy_id, Question.interview_id.is_(None))
        .order_by(Question.order.asc())
    )
    questions = questions_result.scalars().all()

    return LiveInputResponse(
        interview_id=str(interview.id),
        vacancy=LiveInputVacancy(
            title=vacancy.title,
            grade=vacancy.grade,
            description=vacancy.description,
            required_skills=list(vacancy.required_skills),
            nice_to_have_skills=list(vacancy.nice_to_have_skills),
        ),
        candidate=LiveInputCandidate(name=interview.candidate_name or "", resume_text=""),
        questions=[
            LiveInputQuestion(
                id=str(question.id),
                text=question.text,
                skill_tag=list(question.skill_tag),
                intent=question.intent or "",
                reference_answer=question.reference_answer or "",
                rubric_notes="",
                difficulty=question.difficulty,
            )
            for question in questions
        ],
    )
