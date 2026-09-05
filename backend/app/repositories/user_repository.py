from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role_assignment import InternalRoleAssignment
from app.models.user import InternalUser


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
        statement = (
            select(InternalUser)
            .where(InternalUser.created_by_user_id == recruiter_id)
            .order_by(InternalUser.name.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_role_codes(self, user_id: UUID) -> list[str]:
        statement = select(InternalRoleAssignment.role_code).where(
            InternalRoleAssignment.user_id == user_id
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add_role_assignment(
        self,
        user_id: UUID,
        role_code: str,
        assigned_by_user_id: UUID | None = None,
    ) -> InternalRoleAssignment:
        assignment = InternalRoleAssignment(
            user_id=user_id,
            role_code=role_code,
            assigned_by_user_id=assigned_by_user_id,
        )
        self.session.add(assignment)
        await self.session.flush()
        return assignment

    async def remove_role_assignment(self, user_id: UUID, role_code: str) -> bool:
        statement = select(InternalRoleAssignment).where(
            InternalRoleAssignment.user_id == user_id,
            InternalRoleAssignment.role_code == role_code,
        )
        result = await self.session.execute(statement)
        assignment = result.scalar_one_or_none()
        if assignment is None:
            return False
        await self.session.delete(assignment)
        await self.session.flush()
        return True

    async def count_assignments_by_role(self, role_code: str) -> int:
        statement = select(func.count()).select_from(InternalRoleAssignment).where(
            InternalRoleAssignment.role_code == role_code
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def commit(self) -> None:
        await self.session.commit()
