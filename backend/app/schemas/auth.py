from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

RoleCode = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]*$")]


class RecruiterRegister(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)


class InternalUserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    roles: list[RoleCode] = Field(min_length=1)
    temporary_password: str = Field(min_length=8, max_length=255)


class RoleAssignmentUpdate(BaseModel):
    add_roles: list[RoleCode] = Field(default_factory=list)
    remove_roles: list[RoleCode] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_at_least_one_change(self) -> "RoleAssignmentUpdate":
        if not self.add_roles and not self.remove_roles:
            raise ValueError("At least one role change must be provided.")
        return self


class InternalUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    roles: list[RoleCode] = Field(min_length=1)
    created_by_user_id: str | None = None

    @classmethod
    def from_model(cls, user, role_codes: list[str]) -> "InternalUserResponse":
        return cls(
            id=str(user.id),
            name=user.name,
            email=user.email,
            roles=list(role_codes),
            created_by_user_id=str(user.created_by_user_id) if user.created_by_user_id else None,
        )


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: InternalUserResponse


class LandingArea(BaseModel):
    id: str
    label: str
    path: str


class InternalUserLandingResponse(BaseModel):
    roles: list[RoleCode] = Field(min_length=1)
    default_path: str
    available_areas: list[LandingArea]
    available_actions: list[str]


class InternalUserListResponse(BaseModel):
    items: list[InternalUserResponse]
