"""Сервисные эндпоинты для evaluation-agent (specs/005-batch-evaluation-contour).

Доступны только по service-token (`X-Service-Token`) — не для рекрутёрского UI.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import require_service_token
from app.schemas.evaluation import EvaluationCreateRequest, EvaluationInputResponse, EvaluationResponse
from app.services.evaluation_service import EvaluationService

router = APIRouter(prefix="/api/v1/interviews", tags=["evaluation"])


def get_evaluation_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EvaluationService:
    return EvaluationService(session)


@router.get(
    "/{interview_id}/evaluation-input",
    response_model=EvaluationInputResponse,
    dependencies=[Depends(require_service_token)],
)
async def get_evaluation_input(
    interview_id: UUID,
    service: Annotated[EvaluationService, Depends(get_evaluation_service)],
) -> EvaluationInputResponse:
    try:
        return await service.build_evaluation_input(interview_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{interview_id}/evaluation",
    response_model=EvaluationResponse,
    dependencies=[Depends(require_service_token)],
)
async def create_evaluation(
    interview_id: UUID,
    request: EvaluationCreateRequest,
    service: Annotated[EvaluationService, Depends(get_evaluation_service)],
) -> EvaluationResponse:
    try:
        return await service.create_evaluation(interview_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        await service.mark_processing_failed(interview_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation processing failed: {exc}",
        ) from exc


@router.get(
    "/{interview_id}/evaluation",
    response_model=EvaluationResponse,
    dependencies=[Depends(require_service_token)],
)
async def get_evaluation(
    interview_id: UUID,
    service: Annotated[EvaluationService, Depends(get_evaluation_service)],
) -> EvaluationResponse:
    evaluation = await service.get_evaluation(interview_id)
    if evaluation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found.")
    return EvaluationResponse.model_validate(evaluation)

