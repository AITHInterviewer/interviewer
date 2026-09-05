import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.vacancy import Vacancy


def _utcnow() -> datetime:
    return datetime.now(UTC)


class VacancyReviewDecision(Base):
    __tablename__ = "vacancy_review_decisions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vacancies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expert_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=False, index=True
    )
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    vacancy: Mapped["Vacancy"] = relationship(back_populates="review_decisions")
