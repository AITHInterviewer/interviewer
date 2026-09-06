"""Управление outbox-задачами на оценку интервью (claim/complete/fail).

Реализовано через optimistic update, поэтому работает и на Postgres
(FOR UPDATE SKIP LOCKED не требуется), и на SQLite (тесты).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation_job import EvaluationJob
from app.models.interview import Interview


class EvaluationJobService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def claim_pending_job(self) -> EvaluationJob | None:
        """Атомарно забирает одну pending-задачу и переводит interview в processing."""
        max_retries = 5
        for _ in range(max_retries):
            result = await self.session.execute(
                select(EvaluationJob)
                .where(EvaluationJob.status == "pending")
                .order_by(EvaluationJob.created_at.asc())
                .limit(1)
            )
            candidate = result.scalar_one_or_none()
            if candidate is None:
                return None

            update_result = await self.session.execute(
                update(EvaluationJob)
                .where(EvaluationJob.id == candidate.id, EvaluationJob.status == "pending")
                .values(
                    status="processing",
                    started_at=datetime.now(UTC),
                    attempts=EvaluationJob.attempts + 1,
                )
            )
            await self.session.flush()
            if update_result.rowcount == 1:
                interview = await self.session.get(Interview, candidate.interview_id)
                if interview is not None:
                    interview.status = "processing"
                await self.session.commit()
                await self.session.refresh(candidate)
                return candidate
            # another worker claimed it; retry

        return None

    async def complete_job(self, job_id: UUID) -> None:
        job = await self.session.get(EvaluationJob, job_id)
        if job is None:
            raise ValueError("Job not found")

        job.status = "completed"
        job.finished_at = datetime.now(UTC)

        interview = await self.session.get(Interview, job.interview_id)
        if interview is not None:
            interview.status = "completed"

        await self.session.commit()

    async def fail_job(self, job_id: UUID, error: str) -> None:
        job = await self.session.get(EvaluationJob, job_id)
        if job is None:
            raise ValueError("Job not found")

        job.last_error = error

        if job.attempts >= job.max_attempts:
            job.status = "failed"
            job.finished_at = datetime.now(UTC)
            interview_status = "processing_failed"
        else:
            job.status = "pending"
            interview_status = "processing"

        interview = await self.session.get(Interview, job.interview_id)
        if interview is not None:
            interview.status = interview_status
            if interview_status == "processing_failed":
                # Дедицированного product_state для провала нет (см. frontend/lib/pipeline.ts) —
                # честнее «Ответы отправлены», чем вечное «Готовим отчёт».
                interview.product_state = "submitted"

        await self.session.commit()
