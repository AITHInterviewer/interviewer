"""specs/003-recruiter-vacancy-management/data-model.md, раздел Vacancy.

Только схема таблицы — FK-цель для `Question.vacancy_id`/`Interview.vacancy_id` (нужна
цепочка FK до `Answer` для [[004-candidate-interview-flow]]). CRUD рекрутёра — остальной
скоуп 003, не реализован.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# ARRAY(Text) — тип из data-model.md (`text[]`), реален для боевого Postgres. На SQLite
# (только тесты этого репозитория, см. tests/conftest.py — Postgres в песочнице недоступен)
# ARRAY не компилируется, поэтому вариант для sqlite — JSON с тем же списком строк;
# на схему Postgres это не влияет (with_variant подменяет тип только для sqlite-диалекта).
_text_array = ARRAY(Text).with_variant(JSON(), "sqlite")
_jsonb = JSONB().with_variant(JSON(), "sqlite")  # см. question.py — то же обоснование


class Vacancy(Base):
    __tablename__ = "vacancy"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recruiter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internal_users.id"), nullable=False)
    # Назначение опционально: вакансия может остаться без эксперта/менеджера.
    expert_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("internal_users.id"), nullable=True)
    hiring_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("internal_users.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    grade: Mapped[str] = mapped_column(Text, nullable=False)
    required_skills: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    nice_to_have_skills: Mapped[list[str]] = mapped_column(_text_array, nullable=False, default=list)
    # Требования, извлечённые LLM из описания (specs/010-vacancy-from-description).
    # Список объектов {id, name, kind, level, checked, evidence, source} — плоский JSON,
    # а не отдельная таблица: на пилоте требование живёт только внутри своей вакансии,
    # общего справочника нет. `required_skills`/`nice_to_have_skills` держим в синхроне
    # с этим списком — на них завязаны промпт вопросов, карточка вакансии и доска.
    requirements: Mapped[list[dict]] = mapped_column(_jsonb, nullable=False, default=list)
    # Откуда взялось описание — чтобы в редакторе показать имя приложенного файла.
    description_source: Mapped[str] = mapped_column(Text, nullable=False, default="text")
    description_file_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(
            "draft",
            "extracted",
            "calibration",
            "changes_requested",
            "approved",
            "active",
            "paused",
            "archived",
            name="vacancy_status",
        ),
        default="draft",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
