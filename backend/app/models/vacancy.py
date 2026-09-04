"""specs/003-recruiter-vacancy-management/data-model.md, раздел Vacancy.

Только схема таблицы — FK-цель для `Question.vacancy_id`/`Interview.vacancy_id` (нужна
цепочка FK до `Answer` для [[004-candidate-interview-flow]]). CRUD рекрутёра — остальной
скоуп 003, не реализован.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# ARRAY(Text) — тип из data-model.md (`text[]`), реален для боевого Postgres. На SQLite
# (только тесты этого репозитория, см. tests/conftest.py — Postgres в песочнице недоступен)
# ARRAY не компилируется, поэтому вариант для sqlite — JSON с тем же списком строк;
# на схему Postgres это не влияет (with_variant подменяет тип только для sqlite-диалекта).
_text_array = ARRAY(Text).with_variant(JSON(), "sqlite")


class Vacancy(Base):
    __tablename__ = "vacancy"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recruiter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recruiter.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    grade: Mapped[str] = mapped_column(Text, nullable=False)
    required_skills: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    nice_to_have_skills: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    status: Mapped[str] = mapped_column(Enum("draft", "ready", name="vacancy_status"), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
