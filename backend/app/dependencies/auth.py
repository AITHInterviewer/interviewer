from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.models.user import InternalUser, InternalUserRole
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthenticationError, AuthService

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> UserRepository:
    return UserRepository(session)


def get_auth_service(
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> AuthService:
    return AuthService(user_repository)


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


async def get_recruiter(user: Annotated[InternalUser, Depends(get_current_user)]) -> InternalUser:
    if user.role is not InternalUserRole.RECRUITER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruiter access required.")
    return user
