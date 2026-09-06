"""specs/003-recruiter-vacancy-management/data-model.md, раздел Interview.

`access_token`/`status` — то, что реально нужно [[004-candidate-interview-flow]]: WS-
хендшейк (`contracts/control-channel.md`) и LiveKit-токен (`contracts/livekit-token.md`)
валидируют по этим полям. `status`-переходы (`created → in_progress → completed`) пишет
[[001-live-interview-contour]]/[[005-batch-evaluation-contour]] — эта модель только схема.

`product_state` — продуктовая ось 009; технический `status` не ломаем.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

_jsonb = JSONB().with_variant(JSON(), "sqlite")


class Interview(Base):
    __tablename__ = "interview"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    vacancy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vacancy.id"), nullable=False)
    candidate_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_file_url: Mapped[str] = mapped_column(Text, nullable=False)
    access_token: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(
            "created",
            "in_progress",
            "processing",
            "completed",
            "processing_failed",
            name="interview_status",
        ),
        default="created",
    )
    dynamic_questions_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    product_state: Mapped[str] = mapped_column(
        Text, nullable=False, default="invited", server_default="invited"
    )
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rubric_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rubric_version.id"), nullable=True
    )
    report_json: Mapped[dict | None] = mapped_column(_jsonb, nullable=True)
    recording_egress_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Текущий ОСНОВНОЙ вопрос — пишется только на raw-событие "question_started"
    # (InterviewEventService.record_event), НИКОГДА на checkin/adaptive_question. Реальный
    # найденный баг (2026-09-06): фронт держал текст вопроса только в памяти вкладки, из
    # последнего WS ControlEvent — доп./наводящий вопрос от LLM (adaptive_question/checkin)
    # тем же полем перезаписывал текст основного вопроса, кандидат его больше не видел.
    # Персистентно на бэке + отдаётся по HTTP (см. interview_repository.build_consent_info) —
    # переживает reconnect/перезагрузку страницы, не только текущий WS-пуш.
    current_question_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("question.id"), nullable=True)
    current_question_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    recruiter_decision: Mapped[str] = mapped_column(
        Text, nullable=False, default="awaiting", server_default="awaiting"
    )
