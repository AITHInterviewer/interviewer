"""specs/003-recruiter-vacancy-management/contracts/api.md — вакансии/вопросы/интервью.

Роли (план `kind-fluttering-reef.md`): **recruiter** (`area.recruiter_workspace`) пишет
вакансию, генерирует вопросы, создаёт интервью; **expert** (`action.questions.edit`)
правит/добавляет/удаляет вопросы и утверждает вакансию; чтение (`GET`) доступно любой из
этих ролей.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import require_any_capability, require_capability
from app.models.user import InternalUser
from app.repositories.question_repository import QuestionRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.roles.catalog import ACTION_QUESTIONS_EDIT, AREA_EXPERT_QUESTIONS, AREA_RECRUITER_WORKSPACE
from app.schemas.interview import CreateInterviewResponse, InterviewListResponse, InterviewResponse
from app.schemas.vacancy import (
    GenerateQuestionsResponse,
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
    VacancyCreate,
    VacancyListResponse,
    VacancyResponse,
    VacancyUpdate,
)
from app.services.interview_admin_service import InterviewAdminService, VacancyNotReadyForInterviewError
from app.services.vacancy_service import (
    InvalidQuestionError,
    QuestionNotFoundError,
    VacancyLockedError,
    VacancyNotFoundError,
    VacancyNotReadyError,
    VacancyService,
)

router = APIRouter(prefix="/api/v1/vacancies", tags=["vacancies"])

require_recruiter = require_capability(AREA_RECRUITER_WORKSPACE)
require_expert = require_capability(ACTION_QUESTIONS_EDIT)
require_reader = require_any_capability(AREA_RECRUITER_WORKSPACE, AREA_EXPERT_QUESTIONS)


def get_vacancy_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> VacancyService:
    return VacancyService(VacancyRepository(session), QuestionRepository(session))


def get_interview_admin_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InterviewAdminService:
    return InterviewAdminService(session)


async def _vacancy_response(service: VacancyService, vacancy) -> VacancyResponse:
    questions = await service.list_questions(vacancy.id)
    return VacancyResponse.from_model(vacancy, questions)


@router.post("", response_model=VacancyResponse, status_code=status.HTTP_201_CREATED)
async def create_vacancy(
    payload: VacancyCreate,
    actor: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    vacancy = await service.create_vacancy(
        recruiter_id=actor.id,
        title=payload.title,
        description=payload.description,
        grade=payload.grade,
        required_skills=payload.required_skills,
        nice_to_have_skills=payload.nice_to_have_skills,
    )
    return await _vacancy_response(service, vacancy)


@router.get("", response_model=VacancyListResponse)
async def list_vacancies(
    _: Annotated[InternalUser, Depends(require_reader)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyListResponse:
    vacancies = await service.list_vacancies()
    items = [await _vacancy_response(service, vacancy) for vacancy in vacancies]
    return VacancyListResponse(items=items)


@router.get("/{vacancy_id}", response_model=VacancyResponse)
async def get_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_reader)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    return await _vacancy_response(service, vacancy)


@router.patch("/{vacancy_id}", response_model=VacancyResponse)
async def update_vacancy(
    vacancy_id: UUID,
    payload: VacancyUpdate,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.update_vacancy(vacancy_id, **payload.model_dump(exclude_unset=True))
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/questions/generate", response_model=GenerateQuestionsResponse)
async def generate_questions(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> GenerateQuestionsResponse:
    try:
        questions = await service.generate_questions(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    return GenerateQuestionsResponse(questions=[QuestionResponse.model_validate(q) for q in questions])


@router.post(
    "/{vacancy_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED
)
async def add_question(
    vacancy_id: UUID,
    payload: QuestionCreate,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> QuestionResponse:
    try:
        question = await service.add_question(vacancy_id, **payload.model_dump())
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    except InvalidQuestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assessment questions require intent, reference_answer and skill_tag.",
        ) from exc
    return QuestionResponse.model_validate(question)


@router.patch("/{vacancy_id}/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    vacancy_id: UUID,
    question_id: UUID,
    payload: QuestionUpdate,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> QuestionResponse:
    try:
        question = await service.update_question(
            vacancy_id, question_id, payload.model_dump(exclude_unset=True)
        )
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except QuestionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    except InvalidQuestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assessment questions require intent, reference_answer and skill_tag.",
        ) from exc
    return QuestionResponse.model_validate(question)


@router.delete("/{vacancy_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    vacancy_id: UUID,
    question_id: UUID,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> None:
    try:
        await service.delete_question(vacancy_id, question_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except QuestionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc


@router.post("/{vacancy_id}/approve", response_model=VacancyResponse)
async def approve_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.approve_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    except VacancyNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Vacancy has invalid assessment questions: {[str(qid) for qid in exc.question_ids]}",
        ) from exc
    return await _vacancy_response(service, vacancy)


@router.post(
    "/{vacancy_id}/interviews",
    response_model=CreateInterviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    interview_service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
    resume_file: Annotated[UploadFile, File()],
    candidate_name: Annotated[str | None, Form()] = None,
) -> CreateInterviewResponse:
    try:
        vacancy = await vacancy_service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc

    try:
        interview, candidate_link = await interview_service.create_interview(
            vacancy, resume_file, candidate_name
        )
    except VacancyNotReadyForInterviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Vacancy is not ready."
        ) from exc

    return CreateInterviewResponse(
        interview=InterviewResponse.model_validate(interview), candidate_link=candidate_link
    )


@router.get("/{vacancy_id}/interviews", response_model=InterviewListResponse)
async def list_interviews(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    interview_service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
) -> InterviewListResponse:
    try:
        await vacancy_service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc

    interviews = await interview_service.list_interviews(vacancy_id)
    return InterviewListResponse(items=[InterviewResponse.model_validate(i) for i in interviews])
