"""Создание интервью (кандидатская ссылка) рекрутёром — только для `Vacancy.status = ready`
(contracts/api.md, `POST /vacancies/{id}/interviews`)."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.interview import Interview
from app.models.vacancy import Vacancy
from app.services.storage import upload_resume as default_upload_resume

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
        if vacancy.status != "ready":
            raise VacancyNotReadyForInterviewError

        resume_file_url = await self._upload_resume(resume_file)
        access_token = secrets.token_urlsafe(_TOKEN_BYTES)

        interview = Interview(
            vacancy_id=vacancy.id,
            candidate_name=candidate_name,
            resume_file_url=resume_file_url,
            access_token=access_token,
        )
        self.session.add(interview)
        await self.session.commit()
        await self.session.refresh(interview)

        candidate_link = f"{settings.public_frontend_url}/interview/{access_token}"
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
