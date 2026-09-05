import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.vacancy import Vacancy


def _utcnow() -> datetime:
    return datetime.now(UTC)


class VacancyQuestion(Base):
    __tablename__ = "vacancy_questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vacancies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    skill_tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    intent: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    format: Mapped[str] = mapped_column(String(64), default="voice", nullable=False)
    role: Mapped[str] = mapped_column(String(64), default="assessment", nullable=False)
    difficulty: Mapped[str] = mapped_column(String(64), default="baseline", nullable=False)
    estimated_duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stimulus: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(64), default="base_manual", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    vacancy: Mapped["Vacancy"] = relationship(back_populates="questions")
