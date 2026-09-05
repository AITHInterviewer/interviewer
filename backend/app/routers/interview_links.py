from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status

from app.dependencies.auth import (
    get_current_user,
    get_current_user_repository,
    get_interview_link_service,
    get_role_service,
)
from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.roles.catalog import AREA_EXPERT_QUESTIONS, AREA_RECRUITER_WORKSPACE
from app.schemas.interview_links import (
    InterviewCardResponse,
    InterviewLinkCreateRequest,
    InterviewLinkExtendRequest,
    InterviewLinkItem,
    InterviewLinkListResponse,
)
from app.services.interview_link_service import (
    InterviewLinkService,
    _handle_interview_link_error,
)
from app.services.role_service import RoleService

router = APIRouter(tags=["interview-links"])


async def require_links_actor(
    user: Annotated[InternalUser, Depends(get_current_user)],
    user_repository: Annotated[UserRepository, Depends(get_current_user_repository)],
    role_service: Annotated[RoleService, Depends(get_role_service)],
) -> tuple[InternalUser, str]:
    role_codes = await user_repository.list_role_codes(user.id)
    granted = role_service.capabilities_for_roles(role_codes)
    if AREA_RECRUITER_WORKSPACE in granted:
        return user, "recruiter"
    if AREA_EXPERT_QUESTIONS in granted:
        return user, "expert"
    raise HTTPException(
        status_code=http_status.HTTP_403_FORBIDDEN,
        detail="Insufficient capability for this area.",
    )


@router.get("/api/v1/vacancies/{vacancy_id}/links", response_model=InterviewLinkListResponse)
async def list_links(
    vacancy_id: UUID,
    actor: Annotated[tuple[InternalUser, str], Depends(require_links_actor)],
    service: Annotated[InterviewLinkService, Depends(get_interview_link_service)],
) -> InterviewLinkListResponse:
    user, viewer = actor
    try:
        return await service.list_links(user, vacancy_id, viewer=viewer)
    except Exception as exc:  # noqa: BLE001
        raise _handle_interview_link_error(exc) from exc


@router.post(
    "/api/v1/vacancies/{vacancy_id}/links",
    response_model=InterviewLinkItem,
    status_code=http_status.HTTP_201_CREATED,
)
async def create_link(
    vacancy_id: UUID,
    payload: InterviewLinkCreateRequest,
    actor: Annotated[tuple[InternalUser, str], Depends(require_links_actor)],
    service: Annotated[InterviewLinkService, Depends(get_interview_link_service)],
) -> InterviewLinkItem:
    user, _ = actor
    try:
        return await service.create_link(user, vacancy_id, payload)
    except Exception as exc:  # noqa: BLE001
        raise _handle_interview_link_error(exc) from exc


@router.post(
    "/api/v1/vacancies/{vacancy_id}/links/{link_id}/revoke",
    response_model=InterviewLinkItem,
)
async def revoke_link(
    vacancy_id: UUID,
    link_id: UUID,
    actor: Annotated[tuple[InternalUser, str], Depends(require_links_actor)],
    service: Annotated[InterviewLinkService, Depends(get_interview_link_service)],
) -> InterviewLinkItem:
    user, _ = actor
    try:
        return await service.revoke_link(user, vacancy_id, link_id)
    except Exception as exc:  # noqa: BLE001
        raise _handle_interview_link_error(exc) from exc


@router.post(
    "/api/v1/vacancies/{vacancy_id}/links/{link_id}/extend",
    response_model=InterviewLinkItem,
)
async def extend_link(
    vacancy_id: UUID,
    link_id: UUID,
    payload: InterviewLinkExtendRequest,
    actor: Annotated[tuple[InternalUser, str], Depends(require_links_actor)],
    service: Annotated[InterviewLinkService, Depends(get_interview_link_service)],
) -> InterviewLinkItem:
    user, _ = actor
    try:
        return await service.extend_link(user, vacancy_id, link_id, payload.expires_at)
    except Exception as exc:  # noqa: BLE001
        raise _handle_interview_link_error(exc) from exc


@router.get("/api/v1/interview-links/{token}", response_model=InterviewCardResponse)
async def get_card(
    token: str,
    service: Annotated[InterviewLinkService, Depends(get_interview_link_service)],
) -> InterviewCardResponse:
    try:
        return await service.get_card_by_token(token)
    except Exception as exc:  # noqa: BLE001
        raise _handle_interview_link_error(exc) from exc


@router.post("/api/v1/interview-links/{token}/start", response_model=InterviewCardResponse)
async def start_interview(
    token: str,
    service: Annotated[InterviewLinkService, Depends(get_interview_link_service)],
) -> InterviewCardResponse:
    try:
        return await service.start_by_token(token)
    except Exception as exc:  # noqa: BLE001
        raise _handle_interview_link_error(exc) from exc
