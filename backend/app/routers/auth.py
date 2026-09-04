from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import (
    get_auth_service,
    get_current_user,
    get_current_user_repository,
    get_recruiter,
)
from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AuthTokenResponse,
    InternalUserCreate,
    InternalUserLandingResponse,
    InternalUserListResponse,
    InternalUserResponse,
    RecruiterRegister,
    UserLogin,
)
from app.services.auth_service import AuthenticationError, AuthService, DuplicateEmailError
from app.services.user_admin_service import InvalidRoleAssignmentError, UserAdminService

router = APIRouter(prefix="/api/v1", tags=["auth"])


def get_user_admin_service(
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> UserAdminService:
    return UserAdminService(user_repository)


@router.post("/auth/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register_recruiter(
    payload: RecruiterRegister,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> AuthTokenResponse:
    try:
        user = await auth_service.register_recruiter(
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
    except DuplicateEmailError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.") from exc

    return AuthTokenResponse(
        access_token=auth_service.create_access_token(user),
        user=InternalUserResponse.from_model(user),
    )


@router.post("/auth/login", response_model=AuthTokenResponse)
async def login(
    payload: UserLogin,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> AuthTokenResponse:
    try:
        user = await auth_service.authenticate(email=payload.email, password=payload.password)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc

    return AuthTokenResponse(
        access_token=auth_service.create_access_token(user),
        user=InternalUserResponse.from_model(user),
    )


@router.get("/auth/me", response_model=InternalUserResponse)
async def get_me(user: Annotated[InternalUser, Depends(get_current_user)]) -> InternalUserResponse:
    return InternalUserResponse.from_model(user)


@router.post("/internal-users", response_model=InternalUserResponse, status_code=status.HTTP_201_CREATED)
async def create_internal_user(
    payload: InternalUserCreate,
    actor: Annotated[InternalUser, Depends(get_recruiter)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserResponse:
    try:
        user = await user_admin_service.create_internal_user(
            actor=actor,
            name=payload.name,
            email=payload.email,
            role=payload.role,
            temporary_password=payload.temporary_password,
        )
    except DuplicateEmailError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.") from exc
    except InvalidRoleAssignmentError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid role assignment.") from exc

    return InternalUserResponse.from_model(user)


@router.get("/internal-users", response_model=InternalUserListResponse)
async def list_internal_users(
    actor: Annotated[InternalUser, Depends(get_recruiter)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserListResponse:
    users = await user_admin_service.list_internal_users(actor)
    return InternalUserListResponse(items=[InternalUserResponse.from_model(user) for user in users])


@router.get("/internal-users/me/landing", response_model=InternalUserLandingResponse)
async def get_my_landing(
    user: Annotated[InternalUser, Depends(get_current_user)],
    user_admin_service: Annotated[UserAdminService, Depends(get_user_admin_service)],
) -> InternalUserLandingResponse:
    return user_admin_service.get_landing(user)
