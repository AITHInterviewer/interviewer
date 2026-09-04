from app.models.user import InternalUser, InternalUserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import InternalUserLandingResponse
from app.services.auth_service import AuthService, DuplicateEmailError


class InvalidRoleAssignmentError(Exception):
    pass


LANDING_CONTENT: dict[InternalUserRole, InternalUserLandingResponse] = {
    InternalUserRole.RECRUITER: InternalUserLandingResponse(
        role=InternalUserRole.RECRUITER,
        title="Recruiter workspace",
        description="Manage internal access and continue recruiter flows from one protected area.",
        available_actions=[
            "Create hiring manager accounts",
            "Create expert accounts",
            "Open recruiter tools",
        ],
    ),
    InternalUserRole.HIRING_MANAGER: InternalUserLandingResponse(
        role=InternalUserRole.HIRING_MANAGER,
        title="Hiring manager workspace",
        description="Review the role-specific area prepared for future hiring-manager workflows.",
        available_actions=["Open placeholder area", "Verify role access"],
    ),
    InternalUserRole.EXPERT: InternalUserLandingResponse(
        role=InternalUserRole.EXPERT,
        title="Expert workspace",
        description="Review the role-specific area prepared for future expert workflows.",
        available_actions=["Open placeholder area", "Verify role access"],
    ),
}


class UserAdminService:
    def __init__(self, user_repository: UserRepository) -> None:
        self.user_repository = user_repository

    async def create_internal_user(
        self,
        *,
        actor: InternalUser,
        name: str,
        email: str,
        role: InternalUserRole,
        temporary_password: str,
    ) -> InternalUser:
        if actor.role is not InternalUserRole.RECRUITER:
            raise InvalidRoleAssignmentError

        if role is InternalUserRole.RECRUITER:
            raise InvalidRoleAssignmentError

        if await self.user_repository.get_by_email(email):
            raise DuplicateEmailError

        user = InternalUser(
            name=name,
            email=email.lower(),
            password_hash=AuthService.hash_password(temporary_password),
            role=role,
            created_by_user_id=actor.id,
            must_rotate_password=False,
        )
        await self.user_repository.create(user)
        await self.user_repository.commit()
        return user

    def get_landing(self, user: InternalUser) -> InternalUserLandingResponse:
        return LANDING_CONTENT[user.role]

    async def list_internal_users(self, actor: InternalUser) -> list[InternalUser]:
        if actor.role is not InternalUserRole.RECRUITER:
            raise InvalidRoleAssignmentError

        return await self.user_repository.list_by_creator(actor.id)
