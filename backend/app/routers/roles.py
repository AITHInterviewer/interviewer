from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user, get_role_service
from app.models.user import InternalUser
from app.schemas.roles import RoleRegistryEntryResponse, RoleRegistrySnapshotResponse
from app.services.role_service import RoleService

router = APIRouter(prefix="/api/v1/internal", tags=["roles"])


@router.get("/roles", response_model=RoleRegistrySnapshotResponse)
async def get_assignable_roles(
    _: Annotated[InternalUser, Depends(get_current_user)],
    role_service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRegistrySnapshotResponse:
    items = [
        RoleRegistryEntryResponse(code=role.code, title=role.title, sort_order=role.sort_order)
        for role in role_service.assignable_roles()
    ]
    return RoleRegistrySnapshotResponse(items=items)
