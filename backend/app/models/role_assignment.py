import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class InternalRoleAssignment(Base):
    __tablename__ = "internal_role_assignments"
    __table_args__ = (UniqueConstraint("user_id", "role_code", name="uq_role_assignment_user_role"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("internal_users.id", ondelete="CASCADE"), index=True
    )
    role_code: Mapped[str] = mapped_column(String(64), index=True)
    assigned_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
