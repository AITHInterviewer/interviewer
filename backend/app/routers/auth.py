from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import (
    get_auth_service,
    get_current_user,
    get_current_user_repository,
    get_role_service,
    require_capability,
)
from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.roles.catalog import ACTION_INTERNAL_USERS_MANAGE
from app.schemas.auth import (
    AuthTokenResponse,
    InternalUserCreate,
    InternalUserLandingResponse,
    InternalUserListResponse,
    InternalUserResponse,
    RecruiterRegister,
    RoleAssignmentUpdate,
    UserLogin,
)
from app.services.auth_service import AuthenticationError, AuthService, DuplicateEmailError
from app.services.role_service import RoleService
from app.services.user_admin_service import (
    InvalidRoleAssignmentError,
    UserAdminService,
    UserNotFoundError,
)

router = APIRouter(prefix="/api/v1", tags=["auth"])

require_manage_internal_users = require_capability(ACTION_INTERNAL_USERS_MANAGE)


def get_user_admin_service(
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
    role_service: Annotated[RoleService, Depends(get_role_service)],
) -> UserAdminService:
    return UserAdminService(user_repository, role_service)


@router.post("/auth/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register_recruiter(
    payload: RecruiterRegister,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> AuthTokenResponse:
    try:
        user = await auth_service.register_recruiter(
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
    except DuplicateEmailError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.") from exc

    role_codes = await user_repository.list_role_codes(user.id)
    return AuthTokenResponse(
        access_token=auth_service.create_access_token(user),
        user=InternalUserResponse.from_model(user, role_codes),
    )


@router.post("/auth/login", response_model=AuthTokenResponse)
async def login(
    payload: UserLogin,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> AuthTokenResponse:
    try:
        user = await auth_service.authenticate(email=payload.email, password=payload.password)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc

    role_codes = await user_repository.list_role_codes(user.id)
    return AuthTokenResponse(
        access_token=auth_service.create_access_token(user),
        user=InternalUserResponse.from_model(user, role_codes),
    )


@router.get("/auth/me", response_model=InternalUserResponse)
async def get_me(
    user: Annotated[InternalUser, Depends(get_current_user)],
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> InternalUserResponse:
    role_codes = await user_repository.list_role_codes(user.id)
    return InternalUserResponse.from_model(user, role_codes)


@router.post("/internal-users", response_model=InternalUserResponse, status_code=status.HTTP_201_CREATED)
async def create_internal_user(
    payload: InternalUserCreate,
    actor: Annotated[InternalUser, Depends(require_manage_internal_users)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserResponse:
    try:
        user = await user_admin_service.create_internal_user(
            actor=actor,
            name=payload.name,
            email=payload.email,
            roles=list(payload.roles),
            temporary_password=payload.temporary_password,
        )
    except DuplicateEmailError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.") from exc
    except InvalidRoleAssignmentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user_with_roles = await user_admin_service.get_user_with_roles(user.id)
    assert user_with_roles is not None
    user, role_codes = user_with_roles
    return InternalUserResponse.from_model(user, role_codes)


@router.patch("/internal-users/{user_id}/roles", response_model=InternalUserResponse)
async def update_role_assignments(
    user_id: UUID,
    payload: RoleAssignmentUpdate,
    _: Annotated[InternalUser, Depends(require_manage_internal_users)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserResponse:
    try:
        user, role_codes = await user_admin_service.update_role_assignments(
            user_id=user_id,
            changes=payload,
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal user not found.") from exc
    except InvalidRoleAssignmentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return InternalUserResponse.from_model(user, role_codes)


@router.get("/internal-users", response_model=InternalUserListResponse)
async def list_internal_users(
    _: Annotated[InternalUser, Depends(require_manage_internal_users)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserListResponse:
    items = await user_admin_service.list_internal_users(_)
    return InternalUserListResponse(items=items)


@router.get("/internal-users/me/landing", response_model=InternalUserLandingResponse)
async def get_my_landing(
    user: Annotated[InternalUser, Depends(get_current_user)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserLandingResponse:
    return await user_admin_service.get_landing(user)
