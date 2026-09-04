from pydantic import BaseModel

from app.schemas.auth import RoleCode


class RoleRegistryEntryResponse(BaseModel):
    code: RoleCode
    title: str
    sort_order: int


class RoleRegistrySnapshotResponse(BaseModel):
    items: list[RoleRegistryEntryResponse]
