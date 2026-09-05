from uuid import UUID

from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.schemas.auth import InternalUserLandingResponse, InternalUserResponse, RoleAssignmentUpdate
from app.services.auth_service import AuthService, DuplicateEmailError
from app.services.role_service import (
    RoleNotAssignableError,
    RoleService,
    RoleStillAssignedError,
    UnknownRoleError,
)


class InvalidRoleAssignmentError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class UserAdminService:
    def __init__(self, user_repository: UserRepository, role_service: RoleService) -> None:
        self.user_repository = user_repository
        self.role_service = role_service

    async def create_internal_user(
        self,
        *,
        actor: InternalUser,
        name: str,
        email: str,
        roles: list[str],
        temporary_password: str,
    ) -> InternalUser:
        unique_roles = list(dict.fromkeys(roles))
        try:
            self.role_service.validate_assignable_roles(unique_roles)
        except (UnknownRoleError, RoleNotAssignableError) as exc:
            raise InvalidRoleAssignmentError(str(exc)) from exc

        if await self.user_repository.get_by_email(email):
            raise DuplicateEmailError

        user = InternalUser(
            name=name,
            email=email.lower(),
            password_hash=AuthService.hash_password(temporary_password),
            created_by_user_id=actor.id,
            must_rotate_password=False,
        )
        await self.user_repository.create(user)
        for role_code in unique_roles:
            await self.user_repository.add_role_assignment(
                user.id,
                role_code,
                assigned_by_user_id=actor.id,
            )
        await self.user_repository.commit()
        return user

    async def update_role_assignments(
        self,
        *,
        user_id: UUID,
        changes: RoleAssignmentUpdate,
    ) -> tuple[InternalUser, list[str]]:
        user = await self.user_repository.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError

        try:
            self.role_service.validate_assignable_roles(list(changes.add_roles))
            self.role_service.validate_assignable_roles(list(changes.remove_roles))
        except (UnknownRoleError, RoleNotAssignableError) as exc:
            raise InvalidRoleAssignmentError(str(exc)) from exc

        current = set(await self.user_repository.list_role_codes(user_id))
        next_roles = (current | set(changes.add_roles)) - set(changes.remove_roles)
        if not next_roles:
            raise InvalidRoleAssignmentError("An internal account must retain at least one role.")

        for role_code in changes.add_roles:
            if role_code not in current:
                await self.user_repository.add_role_assignment(user_id, role_code)
        for role_code in changes.remove_roles:
            await self.user_repository.remove_role_assignment(user_id, role_code)

        await self.user_repository.commit()
        updated = await self.user_repository.list_role_codes(user_id)
        return user, updated

    async def get_user_with_roles(self, user_id: UUID) -> tuple[InternalUser, list[str]] | None:
        user = await self.user_repository.get_by_id(user_id)
        if user is None:
            return None
        role_codes = await self.user_repository.list_role_codes(user_id)
        return user, role_codes

    async def get_landing(self, user: InternalUser) -> InternalUserLandingResponse:
        role_codes = await self.user_repository.list_role_codes(user.id)
        return self.role_service.build_landing(role_codes)

    async def list_internal_users(self, actor: InternalUser) -> list[InternalUserResponse]:
        users = await self.user_repository.list_by_creator(actor.id)
        items: list[InternalUserResponse] = []
        for user in users:
            role_codes = await self.user_repository.list_role_codes(user.id)
            items.append(InternalUserResponse.from_model(user, role_codes))
        return items

    async def ensure_role_can_retire(self, role_code: str) -> None:
        try:
            await self.role_service.ensure_role_unassigned(role_code, self.user_repository)
        except (UnknownRoleError, RoleStillAssignedError) as exc:
            raise InvalidRoleAssignmentError(str(exc)) from exc
