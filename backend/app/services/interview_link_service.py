import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException

from app.models.interview_link import InterviewLink
from app.models.user import InternalUser
from app.models.vacancy import Vacancy
from app.repositories.interview_link_repository import InterviewLinkRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.schemas.interview_links import (
    InterviewCardResponse,
    InterviewLinkCreateRequest,
    InterviewLinkItem,
    InterviewLinkListResponse,
    InterviewLinkStatus,
)

APPROVED_STATUS = "approved"

STATUS_ACTIVE: InterviewLinkStatus = "active"
STATUS_IN_PROGRESS: InterviewLinkStatus = "in_progress"
STATUS_COMPLETED: InterviewLinkStatus = "completed"
STATUS_EXPIRED: InterviewLinkStatus = "expired"
STATUS_REVOKED: InterviewLinkStatus = "revoked"
STATUS_BLOCKED: InterviewLinkStatus = "blocked"


class InterviewLinkNotFoundError(Exception):
    pass


class InterviewLinkAccessError(Exception):
    pass


class InterviewLinkStateError(Exception):
    pass


class InterviewLinkValidationError(Exception):
    pass


def utcnow() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    """SQLite drops tzinfo; treat naive datetimes as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _handle_interview_link_error(exc: Exception) -> HTTPException:
    if isinstance(exc, InterviewLinkNotFoundError):
        return HTTPException(status_code=404, detail="Interview link not found.")
    if isinstance(exc, InterviewLinkAccessError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, InterviewLinkValidationError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, InterviewLinkStateError):
        return HTTPException(status_code=409, detail=str(exc))
    raise exc


class InterviewLinkService:
    def __init__(
        self,
        link_repository: InterviewLinkRepository,
        vacancy_repository: VacancyRepository,
    ) -> None:
        self.link_repository = link_repository
        self.vacancy_repository = vacancy_repository

    # ------------------------------------------------------------------ helpers

    def _deadline(self, link: InterviewLink, vacancy: Vacancy) -> datetime:
        limit = vacancy.interview_time_limit_minutes or 0
        assert link.started_at is not None
        return _aware(link.started_at) + timedelta(minutes=limit)

    def derive_status(self, link: InterviewLink, vacancy: Vacancy, now: datetime) -> InterviewLinkStatus:
        if link.revoked_at is not None:
            return STATUS_REVOKED
        if link.completed_at is not None:
            return STATUS_COMPLETED
        if vacancy.status != APPROVED_STATUS:
            return STATUS_BLOCKED
        if link.started_at is not None:
            if now >= self._deadline(link, vacancy):
                return STATUS_COMPLETED
            return STATUS_IN_PROGRESS
        if now >= _aware(link.expires_at):
            return STATUS_EXPIRED
        return STATUS_ACTIVE

    def _lazy_finalize(
        self, link: InterviewLink, vacancy: Vacancy, now: datetime
    ) -> InterviewLinkStatus:
        """Mark an interview whose deadline passed as completed (exactly once)."""
        if (
            link.revoked_at is None
            and link.completed_at is None
            and link.started_at is not None
            and now >= self._deadline(link, vacancy)
        ):
            link.completed_at = self._deadline(link, vacancy)
        return self.derive_status(link, vacancy, now)

    def ensure_owner(self, actor: InternalUser, vacancy: Vacancy) -> None:
        if actor.id not in {vacancy.created_by_user_id, vacancy.managing_recruiter_id}:
            raise InterviewLinkAccessError("You do not have access to this vacancy.")

    async def _get_vacancy_or_raise(self, vacancy_id: UUID) -> Vacancy:
        vacancy = await self.vacancy_repository.get_vacancy(vacancy_id)
        if vacancy is None:
            raise InterviewLinkNotFoundError("Vacancy not found.")
        return vacancy

    async def _get_link_or_raise(self, link_id: UUID) -> InterviewLink:
        link = await self.link_repository.get_by_id(link_id)
        if link is None:
            raise InterviewLinkNotFoundError("Interview link not found.")
        return link

    def serialize_item(
        self, link: InterviewLink, vacancy: Vacancy, now: datetime
    ) -> InterviewLinkItem:
        status = self._lazy_finalize(link, vacancy, now)
        return InterviewLinkItem(
            id=str(link.id),
            token=link.token,
            candidate_first_name=link.candidate_first_name,
            candidate_last_name=link.candidate_last_name,
            candidate_social=link.candidate_social,
            candidate_email=link.candidate_email,
            expires_at=link.expires_at,
            status=status,
            created_at=link.created_at,
            started_at=link.started_at,
            completed_at=link.completed_at,
        )

    # ------------------------------------------------------- recruiter/expert API

    async def list_links(
        self, actor: InternalUser, vacancy_id: UUID, *, viewer: str
    ) -> InterviewLinkListResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        is_owner = actor.id in {vacancy.created_by_user_id, vacancy.managing_recruiter_id}
        if not is_owner and viewer != "expert":
            raise InterviewLinkAccessError("You do not have access to this vacancy.")
        now = utcnow()
        links = await self.link_repository.list_for_vacancy(vacancy.id)
        items = [self.serialize_item(link, vacancy, now) for link in links]
        await self.link_repository.commit()
        return InterviewLinkListResponse(items=items)

    async def create_link(
        self, actor: InternalUser, vacancy_id: UUID, payload: InterviewLinkCreateRequest
    ) -> InterviewLinkItem:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_owner(actor, vacancy)
        if vacancy.status != APPROVED_STATUS:
            raise InterviewLinkStateError("Links can be created only for approved vacancies.")
        if vacancy.interview_time_limit_minutes is None:
            raise InterviewLinkStateError(
                "Set the interview time limit on the vacancy before creating links."
            )
        now = utcnow()
        if payload.expires_at <= now:
            raise InterviewLinkValidationError("Expiration must be in the future.")
        link = InterviewLink(
            vacancy_id=vacancy.id,
            token=secrets.token_urlsafe(24),
            candidate_first_name=payload.candidate_first_name.strip(),
            candidate_last_name=payload.candidate_last_name.strip(),
            candidate_social=payload.candidate_social.strip(),
            candidate_email=str(payload.candidate_email) if payload.candidate_email else None,
            expires_at=payload.expires_at,
            created_by_user_id=actor.id,
        )
        await self.link_repository.create(link)
        await self.link_repository.commit()
        return self.serialize_item(link, vacancy, now)

    async def revoke_link(
        self, actor: InternalUser, vacancy_id: UUID, link_id: UUID
    ) -> InterviewLinkItem:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_owner(actor, vacancy)
        link = await self._get_link_or_raise(link_id)
        now = utcnow()
        status = self._lazy_finalize(link, vacancy, now)
        if status not in {STATUS_ACTIVE, STATUS_IN_PROGRESS}:
            raise InterviewLinkStateError("Only active links can be revoked.")
        link.revoked_at = now
        await self.link_repository.commit()
        return self.serialize_item(link, vacancy, now)

    async def extend_link(
        self, actor: InternalUser, vacancy_id: UUID, link_id: UUID, new_expires_at: datetime
    ) -> InterviewLinkItem:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_owner(actor, vacancy)
        link = await self._get_link_or_raise(link_id)
        now = utcnow()
        status = self._lazy_finalize(link, vacancy, now)
        if status != STATUS_ACTIVE:
            raise InterviewLinkStateError("Only active links can be extended.")
        if new_expires_at <= now:
            raise InterviewLinkValidationError("Expiration must be in the future.")
        link.expires_at = new_expires_at
        await self.link_repository.commit()
        return self.serialize_item(link, vacancy, now)

    # ------------------------------------------------------------- public API

    def _card_unavailable_reason(self, status: InterviewLinkStatus) -> str:
        if status == STATUS_EXPIRED:
            return "expired"
        if status == STATUS_REVOKED:
            return "revoked"
        return "vacancy_closed"

    def _start_refusal_message(self, status: InterviewLinkStatus) -> str:
        if status == STATUS_COMPLETED:
            return "Interview already completed."
        if status == STATUS_IN_PROGRESS:
            return "Interview already started."
        if status == STATUS_EXPIRED:
            return "Link expired."
        if status == STATUS_REVOKED:
            return "Link revoked by recruiter."
        return "Vacancy is closed."

    def _build_card(
        self, link: InterviewLink, vacancy: Vacancy, status: InterviewLinkStatus
    ) -> InterviewCardResponse:
        base = {
            "vacancy_title": vacancy.title,
            "candidate_first_name": link.candidate_first_name,
            "candidate_last_name": link.candidate_last_name,
            "interview_time_limit_minutes": vacancy.interview_time_limit_minutes,
        }
        if status == STATUS_ACTIVE:
            return InterviewCardResponse(state="available", expires_at=link.expires_at, **base)
        if status == STATUS_IN_PROGRESS:
            return InterviewCardResponse(
                state="in_progress", deadline_at=self._deadline(link, vacancy), **base
            )
        if status == STATUS_COMPLETED:
            return InterviewCardResponse(state="completed", **base)
        return InterviewCardResponse(
            state="unavailable", reason=self._card_unavailable_reason(status), **base
        )

    async def get_card_by_token(self, token: str) -> InterviewCardResponse:
        link = await self.link_repository.get_by_token(token)
        if link is None:
            raise InterviewLinkNotFoundError("Interview link not found.")
        vacancy = link.vacancy
        now = utcnow()
        status = self._lazy_finalize(link, vacancy, now)
        await self.link_repository.commit()
        return self._build_card(link, vacancy, status)

    async def start_by_token(self, token: str) -> InterviewCardResponse:
        link = await self.link_repository.get_by_token(token)
        if link is None:
            raise InterviewLinkNotFoundError("Interview link not found.")
        vacancy = link.vacancy
        now = utcnow()
        status = self._lazy_finalize(link, vacancy, now)
        if status != STATUS_ACTIVE:
            raise InterviewLinkStateError(self._start_refusal_message(status))
        link.started_at = now
        await self.link_repository.commit()
        return self._build_card(link, vacancy, STATUS_IN_PROGRESS)
