"""Создание интервью (кандидатская ссылка) рекрутёром.

`paused`/`archived` — нельзя. `active` — можно, даже если вопросы не подгружены.
Иначе — если у вакансии уже есть комплект assessment-вопросов с intent, эталоном
и skill_tag (`assessment_set_ready_for_invite`).
(specs/009-pilot-product-model, `POST /vacancies/{id}/interviews`)."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.interview import Interview
from app.models.question import Question
from app.models.rubric_version import RubricVersion
from app.models.vacancy import Vacancy
from app.services.storage import upload_resume as default_upload_resume
from app.services.vacancy_service import assessment_set_ready_for_invite

_TOKEN_BYTES = 24


class VacancyNotReadyForInterviewError(Exception):
    pass


class InterviewAdminService:
    def __init__(
        self,
        session: AsyncSession,
        upload_resume: Callable[[UploadFile], Awaitable[str]] = default_upload_resume,
    ) -> None:
        self.session = session
        self._upload_resume = upload_resume

    async def create_interview(
        self,
        vacancy: Vacancy,
        resume_file: UploadFile,
        candidate_name: str | None = None,
    ) -> tuple[Interview, str]:
        if vacancy.status in {"paused", "archived"}:
            raise VacancyNotReadyForInterviewError
        if vacancy.status != "active":
            questions = list(
                (
                    await self.session.execute(
                        select(Question).where(
                            Question.vacancy_id == vacancy.id,
                            Question.interview_id.is_(None),
                        )
                    )
                ).scalars().all()
            )
            if not assessment_set_ready_for_invite(questions):
                raise VacancyNotReadyForInterviewError

        resume_file_url = await self._upload_resume(resume_file)
        access_token = secrets.token_urlsafe(_TOKEN_BYTES)
        latest_version = (
            await self.session.execute(
                select(RubricVersion)
                .where(RubricVersion.vacancy_id == vacancy.id)
                .order_by(RubricVersion.version_number.desc())
            )
        ).scalars().first()

        interview = Interview(
            vacancy_id=vacancy.id,
            candidate_name=candidate_name,
            resume_file_url=resume_file_url,
            access_token=access_token,
            product_state="invited",
            rubric_version_id=latest_version.id if latest_version else None,
        )
        self.session.add(interview)
        await self.session.commit()
        await self.session.refresh(interview)

        candidate_link = f"{settings.public_frontend_url}/i/{access_token}"
        return interview, candidate_link

    async def list_interviews(self, vacancy_id: UUID) -> list[Interview]:
        statement = (
            select(Interview)
            .where(Interview.vacancy_id == vacancy_id)
            .order_by(Interview.created_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_interview(self, interview_id: UUID) -> Interview | None:
        return await self.session.get(Interview, interview_id)
