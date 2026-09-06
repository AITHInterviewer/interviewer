from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db_session
from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthenticationError, AuthService
from app.services.role_service import RoleService

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> UserRepository:
    return UserRepository(session)


def get_auth_service(
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> AuthService:
    return AuthService(user_repository)


def get_role_service(request: Request) -> RoleService:
    role_service: RoleService | None = getattr(request.app.state, "role_service", None)
    if role_service is None:
        raise RuntimeError("RoleService is not initialized on app.state.")
    return role_service


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> InternalUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await auth_service.get_current_user(credentials.credentials)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc


def require_capability(capability_id: str):
    async def dependency(
        user: Annotated[InternalUser, Depends(get_current_user)],
        user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
        role_service: Annotated[RoleService, Depends(get_role_service)],
    ) -> InternalUser:
        role_codes = await user_repository.list_role_codes(user.id)
        granted = role_service.capabilities_for_user(role_codes, user.email)
        if capability_id not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient capability for this action.",
            )
        return user

    return dependency


def require_any_capability(*capability_ids: str):
    """Как `require_capability`, но пропускает, если у пользователя есть ЛЮБАЯ из
    перечисленных capability — для эндпоинтов, доступных нескольким ролям (напр. чтение
    вакансий и recruiter, и expert)."""

    async def dependency(
        user: Annotated[InternalUser, Depends(get_current_user)],
        user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
        role_service: Annotated[RoleService, Depends(get_role_service)],
    ) -> InternalUser:
        role_codes = await user_repository.list_role_codes(user.id)
        granted = role_service.capabilities_for_user(role_codes, user.email)
        if granted.isdisjoint(capability_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient capability for this action.",
            )
        return user

    return dependency


async def get_granted_capabilities(
    user: Annotated[InternalUser, Depends(get_current_user)],
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
    role_service: Annotated[RoleService, Depends(get_role_service)],
) -> set[str]:
    """Полный набор capability текущего пользователя. Нужен там, где эндпоинт открыт
    нескольким ролям, но ведёт себя по-разному в зависимости от того, кто пришёл
    (правка требований вакансии: до калибровки владелец рекрутёр, на калибровке — эксперт)."""
    role_codes = await user_repository.list_role_codes(user.id)
    return role_service.capabilities_for_user(role_codes, user.email)


def require_area(area_id: str):
    async def dependency(
        user: Annotated[InternalUser, Depends(get_current_user)],
        user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
        role_service: Annotated[RoleService, Depends(get_role_service)],
    ) -> InternalUser:
        role_codes = await user_repository.list_role_codes(user.id)
        granted = role_service.capabilities_for_user(role_codes, user.email)
        if area_id not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient capability for this area.",
            )
        return user

    return dependency


async def require_service_token(
    x_service_token: Annotated[str | None, Header()] = None,
) -> None:
    """Service-to-service auth for evaluation-agent and other internal callers."""
    if x_service_token != settings.evaluation_service_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing service token.",
        )
