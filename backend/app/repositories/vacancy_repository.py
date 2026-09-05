from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacancy import Vacancy


class VacancyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, vacancy: Vacancy) -> Vacancy:
        self.session.add(vacancy)
        await self.session.flush()
        await self.session.refresh(vacancy)
        return vacancy

    async def get_by_id(self, vacancy_id: UUID) -> Vacancy | None:
        return await self.session.get(Vacancy, vacancy_id)

    async def list_all(self) -> list[Vacancy]:
        statement = select(Vacancy).order_by(Vacancy.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def commit(self) -> None:
        await self.session.commit()
