"""MVP-запись событий интервью (см. план `interview_event_service.py`).

Хранит каждый сырой `Event` из Redis-канала `live-agent:events:{interview_id}` как есть
(`payload`), не только подмножество, которое `control_channel.to_control_event`
транслирует кандидатскому UI — нужен полный лог для отладки рекрутёром (US3-подобный
сценарий «посмотреть, что произошло»). Ответы (`Answer`) агрегируются из того же потока
отдельно, см. `interview_event_service.py`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

_jsonb = JSONB().with_variant(JSON(), "sqlite")  # см. models/question.py — то же обоснование


class InterviewEvent(Base):
    __tablename__ = "interview_event"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(_jsonb, nullable=False, default=dict)
    source_event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("source_event_id", name="uq_interview_event_source_event_id"),)
