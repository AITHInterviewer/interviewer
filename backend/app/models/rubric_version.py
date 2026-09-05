"""Версия рубрики после approve (specs/009-pilot-product-model/data-model.md)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

_jsonb = JSONB().with_variant(JSON(), "sqlite")


class RubricVersion(Base):
    __tablename__ = "rubric_version"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    vacancy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vacancy.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("internal_users.id"), nullable=True
    )
    snapshot: Mapped[dict] = mapped_column(_jsonb, nullable=False)
