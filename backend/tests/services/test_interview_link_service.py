from datetime import UTC, datetime, timedelta

import pytest

from app.models.interview_link import InterviewLink
from app.models.user import InternalUser
from app.models.vacancy import Vacancy
from app.repositories.interview_link_repository import InterviewLinkRepository
from app.repositories.user_repository import UserRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.services.auth_service import AuthService
from app.services.interview_link_service import InterviewLinkService


async def build_service(db_session) -> tuple[InterviewLinkService, InternalUser, Vacancy]:
    users = UserRepository(db_session)
    recruiter = InternalUser(
        name="Recruiter",
        email="recruiter@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        must_rotate_password=False,
    )
    await users.create(recruiter)
    vacancies = VacancyRepository(db_session)
    vacancy = Vacancy(
        title="Platform Engineer",
        status="approved",
        interview_time_limit_minutes=45,
        created_by_recruiter_id=recruiter.id,
        created_by_user_id=recruiter.id,
        managing_recruiter_id=recruiter.id,
        updated_at=datetime.now(UTC),
    )
    await vacancies.create_vacancy(vacancy)
    await vacancies.commit()
    return InterviewLinkService(InterviewLinkRepository(db_session), vacancies), recruiter, vacancy


def make_link(vacancy: Vacancy, recruiter: InternalUser, **overrides) -> InterviewLink:
    values = {
        "vacancy_id": vacancy.id,
        "token": overrides.pop("token", "token-1"),
        "candidate_first_name": "Иван",
        "candidate_last_name": "Петров",
        "candidate_social": "t.me/ivan",
        "expires_at": datetime.now(UTC) + timedelta(days=7),
        "created_by_user_id": recruiter.id,
    }
    values.update(overrides)
    return InterviewLink(**values)


@pytest.mark.anyio
async def test_status_derivation_precedence(db_session) -> None:
    service, recruiter, vacancy = await build_service(db_session)
    now = datetime.now(UTC)

    revoked = make_link(vacancy, recruiter, revoked_at=now, started_at=now - timedelta(hours=2))
    assert service.derive_status(revoked, vacancy, now) == "revoked"

    completed = make_link(vacancy, recruiter, completed_at=now - timedelta(hours=1))
    assert service.derive_status(completed, vacancy, now) == "completed"

    running = make_link(vacancy, recruiter, started_at=now - timedelta(minutes=10))
    assert service.derive_status(running, vacancy, now) == "in_progress"

    timed_out = make_link(vacancy, recruiter, started_at=now - timedelta(minutes=60))
    assert service.derive_status(timed_out, vacancy, now) == "completed"

    expired = make_link(vacancy, recruiter, expires_at=now - timedelta(minutes=1))
    assert service.derive_status(expired, vacancy, now) == "expired"

    vacancy.status = "draft"
    blocked = make_link(vacancy, recruiter)
    assert service.derive_status(blocked, vacancy, now) == "blocked"
    vacancy.status = "approved"

    fresh = make_link(vacancy, recruiter)
    assert service.derive_status(fresh, vacancy, now) == "active"


@pytest.mark.anyio
async def test_lazy_finalization_sets_completed_at_once(db_session) -> None:
    service, recruiter, vacancy = await build_service(db_session)
    repo = InterviewLinkRepository(db_session)
    started_at = datetime.now(UTC) - timedelta(minutes=60)
    link = make_link(vacancy, recruiter, started_at=started_at)
    await repo.create(link)
    await repo.commit()

    card = await service.get_card_by_token("token-1")
    assert card.state == "completed"
    assert link.completed_at is not None
    expected = started_at + timedelta(minutes=45)
    assert abs((link.completed_at - expected).total_seconds()) < 1
    first_completed_at = link.completed_at

    refreshed = await db_session.get(InterviewLink, link.id)
    card_again = await service.get_card_by_token("token-1")
    assert card_again.state == "completed"
    assert refreshed.completed_at == first_completed_at


@pytest.mark.anyio
async def test_started_link_is_blocked_when_vacancy_not_approved(db_session) -> None:
    service, recruiter, vacancy = await build_service(db_session)
    now = datetime.now(UTC)

    running = make_link(vacancy, recruiter, started_at=now - timedelta(minutes=5))
    vacancy.status = "draft"
    assert service.derive_status(running, vacancy, now) == "blocked"

    vacancy.status = "approved"
    assert service.derive_status(running, vacancy, now) == "in_progress"
