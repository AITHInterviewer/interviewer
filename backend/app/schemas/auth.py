from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import InternalUser, InternalUserRole


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
    role: InternalUserRole
    temporary_password: str = Field(min_length=8, max_length=255)


class InternalUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    role: InternalUserRole
    created_by_user_id: str | None = None

    @classmethod
    def from_model(cls, user: InternalUser) -> "InternalUserResponse":
        return cls(
            id=str(user.id),
            name=user.name,
            email=user.email,
            role=user.role,
            created_by_user_id=str(user.created_by_user_id) if user.created_by_user_id else None,
        )


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: InternalUserResponse


class InternalUserLandingResponse(BaseModel):
    role: InternalUserRole
    title: str
    description: str
    available_actions: list[str]


class InternalUserListResponse(BaseModel):
    items: list[InternalUserResponse]
