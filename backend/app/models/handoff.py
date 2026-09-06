"""Передача кандидата менеджеру (009 data-model). Один handoff на интервью."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Handoff(Base):
    __tablename__ = "handoff"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview.id"), unique=True, nullable=False)
    from_recruiter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internal_users.id"), nullable=False)
    to_manager_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internal_users.id"), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
