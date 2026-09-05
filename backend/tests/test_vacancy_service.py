"""Юнит-тесты `VacancyService`: переходы статуса и approve-инвариант (contracts/api.md).

LLM не вызывается по-настоящему — `FakeVacancyLLMService` (аналог `FakeLLM` из
live-agent/src/ainterviewer/llm_client.py) возвращает фиксированный набор вопросов.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import InternalUser
from app.repositories.question_repository import QuestionRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.services.vacancy_llm_service import GeneratedQuestion, GeneratedQuestionSet
from app.services.vacancy_service import (
    InvalidQuestionError,
    VacancyLockedError,
    VacancyNotReadyError,
    VacancyService,
)


class FakeVacancyLLMService:
    """Дублёр `VacancyLLMService` для тестов — без сети/подписки, аналог
    `live-agent`'s `FakeLLM` (см. `llm_client.py`)."""

    def __init__(self, questions: list[GeneratedQuestion] | None = None) -> None:
        self.questions = questions or [
            GeneratedQuestion(text="Разогрев", role="warmup", estimated_duration_sec=120),
            GeneratedQuestion(
                text="Расскажите про индексы в Postgres",
                role="assessment",
                skill_tag=["postgres"],
                intent="Проверить знание индексов",
                reference_answer="B-tree, GIN, ...",
                estimated_duration_sec=180,
            ),
            GeneratedQuestion(text="Заключение", role="closing", estimated_duration_sec=120),
        ]
        self.calls = 0

    async def generate_questions(self, vacancy) -> GeneratedQuestionSet:
        self.calls += 1
        return GeneratedQuestionSet(questions=self.questions)


async def _make_recruiter(session: AsyncSession) -> InternalUser:
    recruiter = InternalUser(email=f"{uuid.uuid4()}@example.com", name="Recruiter", password_hash="x")
    session.add(recruiter)
    await session.flush()
    return recruiter


def _make_service(session: AsyncSession, llm_service=None) -> VacancyService:
    return VacancyService(VacancyRepository(session), QuestionRepository(session), llm_service=llm_service)


@pytest.mark.anyio
async def test_create_vacancy_starts_as_draft(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=["python"],
        nice_to_have_skills=[],
    )

    assert vacancy.status == "draft"


@pytest.mark.anyio
async def test_generate_questions_replaces_base_generated_only(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService()
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
    )
    await service.add_question(vacancy.id, text="Manually added question")

    await service.generate_questions(vacancy.id)
    questions = await service.list_questions(vacancy.id)

    assert vacancy.status == "extracted"
    assert llm.calls == 1
    sources = sorted(q.source for q in questions)
    assert sources == ["base_generated", "base_generated", "base_generated", "base_manual"]

    # Regenerating again must not duplicate the manually-added question, only the
    # generated ones.
    await service.generate_questions(vacancy.id)
    questions_after = await service.list_questions(vacancy.id)
    assert len(questions_after) == 4


@pytest.mark.anyio
async def test_approve_requires_non_empty_assessment_fields(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
    )
    bad_question = await service.add_question(
        vacancy.id,
        text="Incomplete assessment question",
        role="warmup",  # valid while warmup — flip to assessment below to break the invariant
    )
    # Bypass the add_question-time validation to simulate a pre-existing invalid row
    # (e.g. LLM-generated then role changed).
    bad_question.role = "assessment"
    await db_session.commit()
    await service.send_to_expert(vacancy.id)

    with pytest.raises(VacancyNotReadyError) as exc_info:
        await service.approve_vacancy(vacancy.id)
    assert bad_question.id in exc_info.value.question_ids


@pytest.mark.anyio
async def test_approve_sets_status_ready_when_valid(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=["python"],
        nice_to_have_skills=[],
    )
    await service.add_question(
        vacancy.id,
        text="Расскажите про индексы в Postgres",
        role="assessment",
        skill_tag=["postgres"],
        intent="intent",
        reference_answer="reference",
    )
    await service.send_to_expert(vacancy.id)
    approved = await service.approve_vacancy(vacancy.id)

    assert approved.status == "approved"


@pytest.mark.anyio
async def test_ready_vacancy_locks_mutations(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=["python"],
        nice_to_have_skills=[],
    )
    await service.add_question(
        vacancy.id,
        text="Расскажите про индексы в Postgres",
        role="assessment",
        skill_tag=["postgres"],
        intent="intent",
        reference_answer="reference",
    )
    await service.send_to_expert(vacancy.id)
    await service.approve_vacancy(vacancy.id)

    with pytest.raises(VacancyLockedError):
        await service.update_vacancy(vacancy.id, title="New title")
    with pytest.raises(VacancyLockedError):
        await service.add_question(vacancy.id, text="Too late")
    with pytest.raises(VacancyLockedError):
        await service.generate_questions(vacancy.id)


@pytest.mark.anyio
async def test_add_question_allows_incomplete_assessment_fields(db_session: AsyncSession) -> None:
    """contracts/api.md: manual questions only require `text` — `intent`/`reference_answer`/
    `skill_tag` are optional at add-time, the invariant is enforced later (update/approve)."""
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
    )

    question = await service.add_question(vacancy.id, text="Missing intent/reference_answer/skill_tag")
    assert question.source == "base_manual"


@pytest.mark.anyio
async def test_update_question_rejects_clearing_required_assessment_fields(
    db_session: AsyncSession,
) -> None:
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=["python"],
        nice_to_have_skills=[],
    )
    question = await service.add_question(
        vacancy.id,
        text="Расскажите про индексы в Postgres",
        role="assessment",
        skill_tag=["postgres"],
        intent="intent",
        reference_answer="reference",
    )

    with pytest.raises(InvalidQuestionError):
        await service.update_question(vacancy.id, question.id, {"intent": None})


@pytest.mark.anyio
async def test_update_question_flips_generated_to_edited(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService()
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
    )
    await service.generate_questions(vacancy.id)
    questions = await service.list_questions(vacancy.id)
    generated = next(q for q in questions if q.source == "base_generated")

    updated = await service.update_question(vacancy.id, generated.id, {"text": "Edited text"})

    assert updated.source == "base_edited"
    assert updated.text == "Edited text"
