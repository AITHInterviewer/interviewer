from uuid import UUID

import pytest

from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.schemas.vacancies import QuestionCreateRequest, VacancyCreateRequest
from app.services.auth_service import AuthService
from app.services.vacancy_service import VacancyConflictError, VacancyReviewService, VacancyService


@pytest.mark.anyio
async def test_managing_recruiter_resolution_uses_creator_chain(db_session) -> None:
    users = UserRepository(db_session)
    recruiter = InternalUser(
        name="Recruiter",
        email="recruiter@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        must_rotate_password=False,
    )
    await users.create(recruiter)
    managed = InternalUser(
        name="Managed Recruiter",
        email="managed@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        created_by_user_id=recruiter.id,
        must_rotate_password=False,
    )
    await users.create(managed)
    await users.commit()

    service = VacancyService(VacancyRepository(db_session), users)

    assert service.resolve_managing_recruiter_id(recruiter) == recruiter.id
    assert service.resolve_managing_recruiter_id(managed) == recruiter.id


@pytest.mark.anyio
async def test_create_question_applies_defaults_and_preserves_creator_ids(db_session) -> None:
    users = UserRepository(db_session)
    recruiter = InternalUser(
        name="Recruiter",
        email="recruiter@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        must_rotate_password=False,
    )
    await users.create(recruiter)
    await users.commit()

    service = VacancyService(VacancyRepository(db_session), users)
    vacancy = await service.create_vacancy(recruiter, VacancyCreateRequest(title="Platform Engineer"))
    updated = await service.create_question(
        recruiter,
        vacancy_id=UUID(vacancy.id),
        payload=QuestionCreateRequest(expected_updated_at=vacancy.updated_at, text="Question"),
    )

    assert updated.created_by_user_id == vacancy.created_by_user_id
    assert updated.managing_recruiter_id == vacancy.managing_recruiter_id
    assert updated.questions[0].format == "voice"
    assert updated.questions[0].role == "assessment"
    assert updated.questions[0].difficulty == "baseline"
    assert updated.questions[0].source == "base_manual"


@pytest.mark.anyio
async def test_conflict_error_raised_for_stale_timestamp(db_session) -> None:
    users = UserRepository(db_session)
    recruiter = InternalUser(
        name="Recruiter",
        email="recruiter@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        must_rotate_password=False,
    )
    await users.create(recruiter)
    await users.commit()
    service = VacancyService(VacancyRepository(db_session), users)
    vacancy = await service.create_vacancy(recruiter, VacancyCreateRequest(title="Platform Engineer"))

    stale = vacancy.updated_at.replace(year=max(vacancy.updated_at.year - 1, 2000))

    with pytest.raises(VacancyConflictError):
        await service.update_vacancy(recruiter, UUID(vacancy.id), title="Next", expected_updated_at=stale)


@pytest.mark.anyio
async def test_review_service_records_latest_review_state(db_session) -> None:
    users = UserRepository(db_session)
    recruiter = InternalUser(
        name="Recruiter",
        email="recruiter@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        must_rotate_password=False,
    )
    expert = InternalUser(
        name="Expert",
        email="expert@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        must_rotate_password=False,
    )
    await users.create(recruiter)
    await users.create(expert)
    await users.commit()
    vacancies = VacancyRepository(db_session)
    vacancy_service = VacancyService(vacancies, users)
    review_service = VacancyReviewService(vacancies, vacancy_service)
    vacancy = await vacancy_service.create_vacancy(recruiter, VacancyCreateRequest(title="Platform Engineer"))
    submitted = await vacancy_service.submit_for_review(recruiter, UUID(vacancy.id), vacancy.updated_at)

    approved = await review_service.approve(
        expert,
        UUID(vacancy.id),
        expected_updated_at=submitted.updated_at,
        comment="Approved",
    )

    assert approved.review_state.latest_review_decision == "approved"
    assert approved.review_state.latest_review_comment == "Approved"
    assert approved.review_state.approved_at is not None
