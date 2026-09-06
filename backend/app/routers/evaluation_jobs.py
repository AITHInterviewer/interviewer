"""Outbox-API для evaluation-agent: claim / complete / fail задачи на оценку.

Доступно только по service-token (`X-Service-Token`).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import require_service_token
from app.schemas.evaluation import EvaluationJobFailRequest, EvaluationJobResponse
from app.services.evaluation_job_service import EvaluationJobService

router = APIRouter(prefix="/api/v1/evaluation-jobs", tags=["evaluation-jobs"])


def get_evaluation_job_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EvaluationJobService:
    return EvaluationJobService(session)


@router.post(
    "/claim",
    response_model=EvaluationJobResponse | None,
    dependencies=[Depends(require_service_token)],
)
async def claim_evaluation_job(
    service: Annotated[EvaluationJobService, Depends(get_evaluation_job_service)],
) -> EvaluationJobResponse | None:
    job = await service.claim_pending_job()
    if job is None:
        return None
    return EvaluationJobResponse.model_validate(job)


@router.post(
    "/{job_id}/complete",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_service_token)],
)
async def complete_evaluation_job(
    job_id: UUID,
    service: Annotated[EvaluationJobService, Depends(get_evaluation_job_service)],
) -> None:
    try:
        await service.complete_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{job_id}/fail",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_service_token)],
)
async def fail_evaluation_job(
    job_id: UUID,
    request: EvaluationJobFailRequest,
    service: Annotated[EvaluationJobService, Depends(get_evaluation_job_service)],
) -> None:
    try:
        await service.fail_job(job_id, request.error)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
