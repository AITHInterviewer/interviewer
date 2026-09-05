import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.interview_link import InterviewLink
    from app.models.vacancy_question import VacancyQuestion
    from app.models.vacancy_review_decision import VacancyReviewDecision


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Vacancy(Base):
    __tablename__ = "vacancies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    grade: Mapped[str | None] = mapped_column(String(32), nullable=True)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ideal_candidate_profile: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_skills: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    nice_to_have_skills: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False, index=True)
    status_before_archive: Mapped[str | None] = mapped_column(String(32), nullable=True)
    interview_time_limit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_recruiter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=False, index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=False, index=True
    )
    managing_recruiter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=False, index=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("internal_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    questions: Mapped[list["VacancyQuestion"]] = relationship(
        back_populates="vacancy",
        cascade="all, delete-orphan",
        order_by="VacancyQuestion.order.asc(), VacancyQuestion.created_at.asc()",
    )
    review_decisions: Mapped[list["VacancyReviewDecision"]] = relationship(
        back_populates="vacancy",
        cascade="all, delete-orphan",
        order_by="VacancyReviewDecision.created_at.asc()",
    )
    interview_links: Mapped[list["InterviewLink"]] = relationship(
        back_populates="vacancy",
        cascade="all, delete-orphan",
        order_by="InterviewLink.created_at.desc()",
    )
