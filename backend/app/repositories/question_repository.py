from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question


class QuestionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, question: Question) -> Question:
        self.session.add(question)
        await self.session.flush()
        await self.session.refresh(question)
        return question

    async def get_by_id(self, question_id: UUID) -> Question | None:
        return await self.session.get(Question, question_id)

    async def list_for_vacancy(self, vacancy_id: UUID) -> list[Question]:
        statement = (
            select(Question)
            .where(Question.vacancy_id == vacancy_id, Question.interview_id.is_(None))
            .order_by(Question.order.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def delete(self, question: Question) -> None:
        await self.session.delete(question)
        await self.session.flush()

    async def delete_generated_for_vacancy(self, vacancy_id: UUID) -> None:
        """Удаляет только `source = base_generated` — вручную добавленные (`base_manual`)
        и отредактированные (`base_edited`) вопросы не трогает (contracts/api.md)."""
        statement = delete(Question).where(
            Question.vacancy_id == vacancy_id,
            Question.interview_id.is_(None),
            Question.source == "base_generated",
        )
        await self.session.execute(statement)
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()
