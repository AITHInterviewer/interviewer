"""specs/003-recruiter-vacancy-management/data-model.md, раздел Question.

Только схема таблицы — [[004-candidate-interview-flow]] читает `format`/`role`/`stimulus`
для `ControlEvent.input_format` (data-model.md той фичи) и как FK-цель для `Answer`. CRUD
базовых вопросов вакансии — остальной скоуп 003, не реализован.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ARRAY, JSON, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

_text_array = ARRAY(Text).with_variant(JSON(), "sqlite")  # см. vacancy.py — то же обоснование
_jsonb = JSONB().with_variant(JSON(), "sqlite")  # data-model.md требует jsonb на Postgres


class Question(Base):
    __tablename__ = "question"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    vacancy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vacancy.id"), nullable=False)
    interview_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("interview.id"), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    skill_tag: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    intent: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Термины/жаргон/названия инструментов, которые вероятны в устном ответе кандидата на
    # этот вопрос — подсказка ASR-словарю (Whisper `prompt`). Заполняется LLM при approve
    # вакансии; None до этого. live-agent подмешивает их в STT-подсказку на этот вопрос.
    stt_terms: Mapped[list[str] | None] = mapped_column(_text_array, nullable=True)
    format: Mapped[str] = mapped_column(
        Enum("voice", "code_review_verbal", "live_coding", name="question_format"), default="voice"
    )
    role: Mapped[str] = mapped_column(
        Enum("assessment", "warmup", "closing", name="question_role"), default="assessment"
    )
    difficulty: Mapped[str] = mapped_column(
        Enum("baseline", "stretch", name="question_difficulty"), default="baseline"
    )
    estimated_duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    stimulus: Mapped[dict | None] = mapped_column(_jsonb, nullable=True)
    source: Mapped[str] = mapped_column(
        Enum("base_generated", "base_edited", "base_manual", "dynamic", name="question_source"),
        nullable=False,
    )
    dynamic_trigger: Mapped[str | None] = mapped_column(
        Enum(
            "clarification",
            "contradiction_check",
            "drill_down",
            "leading_hint",
            "resume_inspired",
            name="question_dynamic_trigger",
        ),
        nullable=True,
    )
    parent_question_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("question.id"), nullable=True)
