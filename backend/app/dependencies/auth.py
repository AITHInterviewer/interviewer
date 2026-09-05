from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.models.user import InternalUser
from app.repositories.interview_link_repository import InterviewLinkRepository
from app.repositories.user_repository import UserRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.roles.catalog import AREA_EXPERT_QUESTIONS, AREA_RECRUITER_WORKSPACE
from app.services.auth_service import AuthenticationError, AuthService
from app.services.interview_link_service import InterviewLinkService
from app.services.role_service import RoleService
from app.services.vacancy_service import VacancyReviewService, VacancyService

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


def get_vacancy_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> VacancyRepository:
    return VacancyRepository(session)


def get_vacancy_service(
    vacancy_repository: Annotated[VacancyRepository, Depends(get_vacancy_repository)],
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
) -> VacancyService:
    return VacancyService(vacancy_repository, user_repository)


def get_vacancy_review_service(
    vacancy_repository: Annotated[VacancyRepository, Depends(get_vacancy_repository)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyReviewService:
    return VacancyReviewService(vacancy_repository, vacancy_service)


def get_interview_link_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InterviewLinkRepository:
    return InterviewLinkRepository(session)


def get_interview_link_service(
    link_repository: Annotated[InterviewLinkRepository, Depends(get_interview_link_repository)],
    vacancy_repository: Annotated[VacancyRepository, Depends(get_vacancy_repository)],
) -> InterviewLinkService:
    return InterviewLinkService(link_repository, vacancy_repository)


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
        granted = role_service.capabilities_for_roles(role_codes)
        if capability_id not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient capability for this action.",
            )
        return user

    return dependency


def require_area(area_id: str):
    async def dependency(
        user: Annotated[InternalUser, Depends(get_current_user)],
        user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
        role_service: Annotated[RoleService, Depends(get_role_service)],
    ) -> InternalUser:
        role_codes = await user_repository.list_role_codes(user.id)
        granted = role_service.capabilities_for_roles(role_codes)
        if area_id not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient capability for this area.",
            )
        return user

    return dependency


require_recruiter_workspace = require_area(AREA_RECRUITER_WORKSPACE)
require_expert_workspace = require_area(AREA_EXPERT_QUESTIONS)
