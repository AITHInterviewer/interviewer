"""specs/003-recruiter-vacancy-management/data-model.md, раздел Interview.

`access_token`/`status` — то, что реально нужно [[004-candidate-interview-flow]]: WS-
хендшейк (`contracts/control-channel.md`) и LiveKit-токен (`contracts/livekit-token.md`)
валидируют по этим полям. `status`-переходы (`created → in_progress → completed`) пишет
[[001-live-interview-contour]]/[[005-batch-evaluation-contour]] — эта модель только схема.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


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
