"""Тесты outbox-задач на оценку интервью (evaluation_job)."""

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import Enum, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EvaluationJob
from app.services.interview_event_service import InterviewEventService
from tests.conftest import seed_demo_interview

SERVICE_TOKEN = "dev-evaluation-token"


def test_evaluation_job_status_uses_postgres_enum() -> None:
    status_type = EvaluationJob.__table__.c.status.type

    assert isinstance(status_type, Enum)
    assert status_type.name == "evaluation_job_status"


@pytest.mark.anyio
async def test_interview_completed_creates_evaluation_job(
    db_session: AsyncSession,
) -> None:
    interview = await seed_demo_interview(db_session, status="in_progress")
    service = InterviewEventService(db_session)

    await service.record_event(
        interview.id,
        {"type": "interview_completed", "ts": "2026-09-06T12:00:00+00:00"},
    )

    await db_session.refresh(interview)
    assert interview.status == "completed"
    assert interview.completed_at is not None

    job = await db_session.scalar(
        select(EvaluationJob).where(EvaluationJob.interview_id == interview.id)
    )
    assert job is not None
    assert job.status == "pending"


@pytest.mark.anyio
async def test_claim_evaluation_job_sets_processing_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session)
    db_session.add(EvaluationJob(interview_id=interview.id, status="pending"))
    await db_session.commit()

    response = await client.post(
        "/api/v1/evaluation-jobs/claim",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data is not None
    assert data["status"] == "processing"
    assert data["attempts"] == 1

    await db_session.refresh(interview)
    assert interview.status == "processing"

    # second claim returns nothing
    second = await client.post(
        "/api/v1/evaluation-jobs/claim",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    assert second.status_code == 200
    assert second.json() is None


@pytest.mark.anyio
async def test_fail_requeues_until_max_attempts_then_failed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session, status="in_progress")
    db_session.add(EvaluationJob(interview_id=interview.id, status="pending", max_attempts=2))
    await db_session.commit()

    claim = await client.post(
        "/api/v1/evaluation-jobs/claim",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    job_id = UUID(claim.json()["id"])

    # first failure -> requeued
    response = await client.post(
        f"/api/v1/evaluation-jobs/{job_id}/fail",
        headers={"X-Service-Token": SERVICE_TOKEN},
        json={"error": "transient error"},
    )
    assert response.status_code == 204

    job = await db_session.get(EvaluationJob, job_id)
    await db_session.refresh(job)
    assert job.status == "pending"
    assert job.attempts == 1

    # claim again and final failure -> failed
    claim2 = await client.post(
        "/api/v1/evaluation-jobs/claim",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    job_id2 = UUID(claim2.json()["id"])
    assert job_id2 == job_id

    response = await client.post(
        f"/api/v1/evaluation-jobs/{job_id}/fail",
        headers={"X-Service-Token": SERVICE_TOKEN},
        json={"error": "final error"},
    )
    assert response.status_code == 204

    job = await db_session.get(EvaluationJob, job_id)
    await db_session.refresh(job)
    assert job.status == "failed"
    assert job.attempts == 2
    assert "final error" in job.last_error

    await db_session.refresh(interview)
    assert interview.status == "processing_failed"


@pytest.mark.anyio
async def test_complete_evaluation_job_sets_completed_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session, status="in_progress")
    db_session.add(EvaluationJob(interview_id=interview.id, status="pending"))
    await db_session.commit()

    claim = await client.post(
        "/api/v1/evaluation-jobs/claim",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    job_id = UUID(claim.json()["id"])

    response = await client.post(
        f"/api/v1/evaluation-jobs/{job_id}/complete",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    assert response.status_code == 204

    job = await db_session.get(EvaluationJob, job_id)
    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.finished_at is not None

    await db_session.refresh(interview)
    assert interview.status == "completed"


@pytest.mark.anyio
async def test_duplicate_interview_completed_is_idempotent(
    db_session: AsyncSession,
) -> None:
    interview = await seed_demo_interview(db_session, status="in_progress")
    service = InterviewEventService(db_session)

    event = {"type": "interview_completed", "ts": "2026-09-06T12:00:00+00:00"}
    await service.record_event(interview.id, event)
    await service.record_event(interview.id, event)

    result = await db_session.execute(
        select(EvaluationJob).where(EvaluationJob.interview_id == interview.id)
    )
    assert len(result.scalars().all()) == 1


@pytest.mark.anyio
async def test_stream_event_is_idempotent_after_consumer_restart(
    db_session: AsyncSession,
) -> None:
    interview = await seed_demo_interview(db_session, status="in_progress")
    service = InterviewEventService(db_session)
    event = {"type": "interview_completed", "ts": "2026-09-06T12:00:00+00:00"}

    await service.record_event(interview.id, event, source_event_id="1760000000000-0")
    await service.record_event(interview.id, event, source_event_id="1760000000000-0")

    events = await db_session.execute(
        select(EvaluationJob).where(EvaluationJob.interview_id == interview.id)
    )
    assert len(events.scalars().all()) == 1
