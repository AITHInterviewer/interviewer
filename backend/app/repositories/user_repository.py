from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import InternalUser, InternalUserRole


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_email(self, email: str) -> InternalUser | None:
        statement = select(InternalUser).where(InternalUser.email == email.lower())
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: UUID) -> InternalUser | None:
        statement = select(InternalUser).where(InternalUser.id == user_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def create(self, user: InternalUser) -> InternalUser:
        self.session.add(user)
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def list_by_creator(self, recruiter_id: UUID) -> list[InternalUser]:
        role_order = case(
            (InternalUser.role == InternalUserRole.RECRUITER, 0),
            (InternalUser.role == InternalUserRole.HIRING_MANAGER, 1),
            else_=2,
        )
        statement = (
            select(InternalUser)
            .where(InternalUser.created_by_user_id == recruiter_id)
            .order_by(role_order, InternalUser.name.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def commit(self) -> None:
        await self.session.commit()
