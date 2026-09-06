"""Evaluation — результат batch-контура оценки интервью (specs/005-batch-evaluation-contour).

Хранит пер-вопросные оценки, агрегированный вердикт и саммари, которые вернул
`evaluation-agent`. Одна запись на интервью (`interview_id` unique).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

_jsonb = JSONB().with_variant(JSON(), "sqlite")
_text_array = ARRAY(Text).with_variant(JSON(), "sqlite")


class Evaluation(Base):
    __tablename__ = "evaluation"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # per_question[] из архитектурного документа, раздел 4.
    per_question: Mapped[list] = mapped_column(_jsonb, nullable=False, default=list)

    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verdict: Mapped[str] = mapped_column(Text, nullable=False)

    confirmed_skills: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    unconfirmed_skills: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)

    contradictions_found: Mapped[list] = mapped_column(_jsonb, nullable=False, default=list)

    strengths: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    risks: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)

    summary_intro: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_conclusion: Mapped[str | None] = mapped_column(Text, nullable=True)

    model_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
