from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_vacancy_review_service, require_expert_workspace
from app.models.user import InternalUser
from app.schemas.vacancies import (
    QuestionUpdateRequest,
    ReviewDecisionRequest,
    VacancyDetailResponse,
    VacancyListResponse,
)
from app.services.vacancy_review_service import VacancyReviewService
from app.services.vacancy_service import (
    QuestionNotFoundError,
    VacancyAccessError,
    VacancyConflictError,
    VacancyNotFoundError,
)

router = APIRouter(prefix="/api/v1/expert/vacancies", tags=["expert-vacancies"])


def _handle_vacancy_error(exc: Exception) -> HTTPException:
    if isinstance(exc, VacancyNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.")
    if isinstance(exc, QuestionNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    if isinstance(exc, VacancyAccessError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, VacancyConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    raise exc


@router.get("", response_model=VacancyListResponse)
async def list_expert_vacancies(
    _: Annotated[InternalUser, Depends(require_expert_workspace)],
    vacancy_review_service: Annotated[VacancyReviewService, Depends(get_vacancy_review_service)],
) -> VacancyListResponse:
    return await vacancy_review_service.list_queue()


@router.get("/{vacancy_id}", response_model=VacancyDetailResponse)
async def get_expert_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_expert_workspace)],
    vacancy_review_service: Annotated[VacancyReviewService, Depends(get_vacancy_review_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_review_service.get_review_vacancy(vacancy_id)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.patch("/{vacancy_id}/questions/{question_id}", response_model=VacancyDetailResponse)
async def update_expert_question(
    vacancy_id: UUID,
    question_id: UUID,
    payload: QuestionUpdateRequest,
    actor: Annotated[InternalUser, Depends(require_expert_workspace)],
    vacancy_review_service: Annotated[VacancyReviewService, Depends(get_vacancy_review_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_review_service.update_question(actor, vacancy_id, question_id, payload)
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.post("/{vacancy_id}/approve", response_model=VacancyDetailResponse)
async def approve_vacancy(
    vacancy_id: UUID,
    payload: ReviewDecisionRequest,
    actor: Annotated[InternalUser, Depends(require_expert_workspace)],
    vacancy_review_service: Annotated[VacancyReviewService, Depends(get_vacancy_review_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_review_service.approve(
            actor, vacancy_id, expected_updated_at=payload.expected_updated_at, comment=payload.comment
        )
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc


@router.post("/{vacancy_id}/request-changes", response_model=VacancyDetailResponse)
async def request_changes(
    vacancy_id: UUID,
    payload: ReviewDecisionRequest,
    actor: Annotated[InternalUser, Depends(require_expert_workspace)],
    vacancy_review_service: Annotated[VacancyReviewService, Depends(get_vacancy_review_service)],
) -> VacancyDetailResponse:
    try:
        return await vacancy_review_service.request_changes(
            actor, vacancy_id, expected_updated_at=payload.expected_updated_at, comment=payload.comment
        )
    except Exception as exc:
        raise _handle_vacancy_error(exc) from exc
