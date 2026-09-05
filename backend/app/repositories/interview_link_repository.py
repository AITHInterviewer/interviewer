from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.interview_link import InterviewLink


class InterviewLinkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _statement(self):
        return select(InterviewLink).options(selectinload(InterviewLink.vacancy))

    async def create(self, link: InterviewLink) -> InterviewLink:
        self.session.add(link)
        await self.session.flush()
        return link

    async def get_by_id(self, link_id: UUID) -> InterviewLink | None:
        result = await self.session.execute(self._statement().where(InterviewLink.id == link_id))
        return result.scalar_one_or_none()

    async def get_by_token(self, token: str) -> InterviewLink | None:
        result = await self.session.execute(self._statement().where(InterviewLink.token == token))
        return result.scalar_one_or_none()

    async def list_for_vacancy(self, vacancy_id: UUID) -> list[InterviewLink]:
        result = await self.session.execute(
            self._statement()
            .where(InterviewLink.vacancy_id == vacancy_id)
            .order_by(InterviewLink.created_at.desc())
        )
        return list(result.scalars().all())

    async def commit(self) -> None:
        await self.session.commit()
