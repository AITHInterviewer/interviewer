"""specs/004-candidate-interview-flow/data-model.md, раздел Answer (T004).

Персистентная сущность этой фичи — вход для batch-контура ([[005-batch-evaluation-contour]]).
`role` копируется с `Question.role` на момент записи, чтобы batch-контур не джойнил
`Question` заново, чтобы понять, оценивать ли ответ (см. data-model.md, комментарий к полю).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

_jsonb = JSONB().with_variant(JSON(), "sqlite")  # см. models/question.py — то же обоснование


class Answer(Base):
    __tablename__ = "answer"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview.id"), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("question.id"), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("assessment", "warmup", "closing", name="answer_role"), nullable=False
    )
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_submission: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_language: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_snapshots: Mapped[list] = mapped_column(_jsonb, nullable=False, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
