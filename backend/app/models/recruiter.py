"""specs/003-recruiter-vacancy-management/data-model.md, раздел Recruiter.

Только схема таблицы — заведена здесь исключительно как FK-цель для `Vacancy.recruiter_id`
(нужна, чтобы завести `Interview`/`Question`/`Answer` для [[004-candidate-interview-flow]]).
CRUD/аутентификация рекрутёра — остальной скоуп 003, не реализованы.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Recruiter(Base):
    __tablename__ = "recruiter"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
