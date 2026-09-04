import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class InternalUserRole(str, enum.Enum):
    RECRUITER = "recruiter"
    HIRING_MANAGER = "hiring_manager"
    EXPERT = "expert"


class InternalUser(Base):
    __tablename__ = "internal_users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[InternalUserRole] = mapped_column(
        Enum(
            InternalUserRole,
            name="internal_user_role",
            values_callable=enum_values,
        )
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=True
    )
    must_rotate_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped["InternalUser | None"] = relationship(remote_side=[id], lazy="joined")
