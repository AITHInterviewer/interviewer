from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vacancy import Vacancy
from app.models.vacancy_question import VacancyQuestion
from app.models.vacancy_review_decision import VacancyReviewDecision


class VacancyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _detail_statement(self):
        return select(Vacancy).options(
            selectinload(Vacancy.questions),
            selectinload(Vacancy.review_decisions),
        )

    async def create_vacancy(self, vacancy: Vacancy) -> Vacancy:
        self.session.add(vacancy)
        await self.session.flush()
        return await self.get_vacancy(vacancy.id)

    async def get_vacancy(self, vacancy_id: UUID) -> Vacancy | None:
        result = await self.session.execute(self._detail_statement().where(Vacancy.id == vacancy_id))
        return result.scalar_one_or_none()

    async def list_recruiter_vacancies(self, actor_id: UUID, status: str | None = None) -> list[Vacancy]:
        statement = self._detail_statement().where(
            or_(Vacancy.created_by_user_id == actor_id, Vacancy.managing_recruiter_id == actor_id)
        )
        if status is not None:
            statement = statement.where(Vacancy.status == status)
        statement = statement.order_by(Vacancy.updated_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_expert_queue(self, status: str = "submitted_for_review") -> list[Vacancy]:
        result = await self.session.execute(
            self._detail_statement().where(Vacancy.status == status).order_by(Vacancy.submitted_at.desc())
        )
        return list(result.scalars().all())

    async def add_question(self, question: VacancyQuestion) -> VacancyQuestion:
        self.session.add(question)
        await self.session.flush()
        return question

    async def get_question(self, question_id: UUID) -> VacancyQuestion | None:
        result = await self.session.execute(
            select(VacancyQuestion).where(VacancyQuestion.id == question_id)
        )
        return result.scalar_one_or_none()

    async def delete_question(self, question: VacancyQuestion) -> None:
        await self.session.delete(question)
        await self.session.flush()

    async def add_review_decision(self, decision: VacancyReviewDecision) -> VacancyReviewDecision:
        self.session.add(decision)
        await self.session.flush()
        return decision

    async def commit(self) -> None:
        await self.session.commit()

    async def refresh(self, entity) -> None:
        await self.session.refresh(entity)

    @staticmethod
    def updated_at_matches(actual: datetime, expected: datetime) -> bool:
        return actual.replace(tzinfo=None) == expected.replace(tzinfo=None)
