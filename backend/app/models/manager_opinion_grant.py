"""Временный доступ менеджера к карточке без передачи (009 data-model)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ManagerOpinionGrant(Base):
    __tablename__ = "manager_opinion_grant"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview.id"), nullable=False)
    manager_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internal_users.id"), nullable=False)
    granted_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internal_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
