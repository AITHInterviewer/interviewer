from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import get_vacancy_service, require_recruiter_workspace
from app.models.user import InternalUser
from app.schemas.vacancies import (
    QuestionCreateRequest,
    QuestionUpdateRequest,
    VacancyCreateRequest,
    VacancyDetailResponse,
    VacancyListResponse,
    VacancyUpdateRequest,
)
from app.services.vacancy_service import (
    QuestionNotFoundError,
    VacancyAccessError,
    VacancyConflictError,
    VacancyNotFoundError,
    VacancyService,
    VacancyStateError,
)

router = APIRouter(prefix="/api/v1/vacancies", tags=["vacancies"])


def _handle_vacancy_error(exc: Exception) -> HTTPException:
    if isinstance(exc, VacancyNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.")
    if isinstance(exc, QuestionNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    if isinstance(exc, VacancyAccessError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, VacancyConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, VacancyStateError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    raise exc


@router.get("", response_model=VacancyListResponse)
async def list_vacancies(
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    status_filter: str | None = Query(default=None, alias="status"),
) -> VacancyListResponse:
    return await vacancy_service.list_recruiter_vacancies(actor, status=status_filter)


@router.post("", response_model=VacancyDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_vacancy(
    payload: VacancyCreateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    return await vacancy_service.create_vacancy(actor, payload)


@router.get("/{vacancy_id}", response_model=VacancyDetailResponse)
async def get_vacancy(
    vacancy_id: UUID,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.get_recruiter_vacancy(actor, vacancy_id)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.patch("/{vacancy_id}", response_model=VacancyDetailResponse)
async def update_vacancy(
    vacancy_id: UUID,
    payload: VacancyUpdateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.update_vacancy(
            actor,
            vacancy_id,
            title=payload.title,
            grade=payload.grade,
            job_description=payload.job_description,
            ideal_candidate_profile=payload.ideal_candidate_profile,
            required_skills=payload.required_skills,
            nice_to_have_skills=payload.nice_to_have_skills,
            interview_time_limit_minutes=payload.interview_time_limit_minutes,
            interview_time_limit_provided="interview_time_limit_minutes" in payload.model_fields_set,
            expected_updated_at=payload.expected_updated_at,
        )
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.post("/{vacancy_id}/questions", response_model=VacancyDetailResponse)
async def add_question(
    vacancy_id: UUID,
    payload: QuestionCreateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.create_question(actor, vacancy_id, payload)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.patch("/{vacancy_id}/questions/{question_id}", response_model=VacancyDetailResponse)
async def update_question(
    vacancy_id: UUID,
    question_id: UUID,
    payload: QuestionUpdateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.update_question(actor, vacancy_id, question_id, payload)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.delete("/{vacancy_id}/questions/{question_id}", response_model=VacancyDetailResponse)
async def delete_question(
    vacancy_id: UUID,
    question_id: UUID,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    expected_updated_at: str = Query(...),
) -> VacancyDetailResponse:
    try:
        expected_timestamp = VacancyUpdateRequest(
            expected_updated_at=expected_updated_at
        ).expected_updated_at
        return await vacancy_service.delete_question(
            actor,
            vacancy_id,
            question_id,
            expected_timestamp,
        )
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.post("/{vacancy_id}/submit-for-review", response_model=VacancyDetailResponse)
async def submit_for_review(
    vacancy_id: UUID,
    payload: VacancyUpdateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.submit_for_review(actor, vacancy_id, payload.expected_updated_at)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.post("/{vacancy_id}/archive", response_model=VacancyDetailResponse)
async def archive_vacancy(
    vacancy_id: UUID,
    payload: VacancyUpdateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.archive(actor, vacancy_id, payload.expected_updated_at)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.post("/{vacancy_id}/restore", response_model=VacancyDetailResponse)
async def restore_vacancy(
    vacancy_id: UUID,
    payload: VacancyUpdateRequest,
    actor: Annotated[InternalUser, Depends(require_recruiter_workspace)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_service.restore(actor, vacancy_id, payload.expected_updated_at)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc
