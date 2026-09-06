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
    RequirementCoverageError,
    VacancyLockedError,
    VacancyMissingRequirementsError,
    VacancyNotReadyError,
    VacancyService,
)


def _requirements(*names: str) -> list[dict]:
    return [
        {"id": f"req_{i}", "name": name, "kind": "must", "level": "confident",
         "checked": True, "evidence": f"«{name}»", "source": "llm"}
        for i, name in enumerate(names)
    ]


# Минимальный набор, с которым вакансию пускают к эксперту.
_THREE = _requirements("Python", "PostgreSQL", "Docker")


class FakeVacancyLLMService:
    """Дублёр `VacancyLLMService` для тестов — без сети/подписки, аналог
    `live-agent`'s `FakeLLM` (см. `llm_client.py`)."""

    def __init__(self, questions: list[GeneratedQuestion] | None = None) -> None:
        self._fixed = questions
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
        if self._fixed is not None:
            return GeneratedQuestionSet(questions=self._fixed)
        # По умолчанию — по вопросу на каждое включённое требование, иначе approve
        # справедливо ругается на непокрытые требования.
        names = [item["name"] for item in vacancy.requirements if item.get("checked")]
        if not names:
            return GeneratedQuestionSet(questions=self.questions)
        return GeneratedQuestionSet(
            questions=[
                GeneratedQuestion(text="Разогрев", role="warmup", estimated_duration_sec=120),
                *[
                    GeneratedQuestion(
                        text=f"Вопрос про {name}",
                        role="assessment",
                        skill_tag=[name],
                        intent="Проверить знание",
                        reference_answer="Эталон",
                        estimated_duration_sec=180,
                    )
                    for name in names
                ],
                GeneratedQuestion(text="Заключение", role="closing", estimated_duration_sec=120),
            ]
        )

    async def generate_stt_terms(self, vacancy, questions) -> dict[str, list[str]]:
        self.calls += 1
        # эмулируем частичный ответ LLM: термины не для всех вопросов
        return {str(questions[0].id): ["PostgreSQL", "B-tree"]}

    async def generate_single_question(self, vacancy, existing) -> GeneratedQuestion:
        self.calls += 1
        return GeneratedQuestion(
            text=f"Regenerated: {existing.text}",
            role=existing.role,
            skill_tag=["postgres"],
            intent="Проверить знание индексов, переформулировано",
            reference_answer="B-tree, GIN, ... (v2)",
            estimated_duration_sec=200,
        )


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
async def test_send_to_expert_requires_enough_checked_requirements(db_session: AsyncSession) -> None:
    """Эксперту уходят требования, а не вопросы — поэтому гейт стоит на них."""
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
        requirements=_requirements("Python", "PostgreSQL"),
    )

    with pytest.raises(VacancyMissingRequirementsError):
        await service.send_to_expert(vacancy.id)

    await service.update_vacancy(vacancy.id, requirements=_THREE)
    sent = await service.send_to_expert(vacancy.id)
    assert sent.status == "calibration"


@pytest.mark.anyio
async def test_regenerate_question_keeps_id_and_role_replaces_content(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService()
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=["postgres"],
        nice_to_have_skills=[],
    )
    question = await service.add_question(
        vacancy.id,
        text="Original question",
        role="assessment",
        intent="original intent",
        reference_answer="original answer",
        skill_tag=["postgres"],
    )

    regenerated = await service.regenerate_question(vacancy.id, question.id)

    assert regenerated.id == question.id
    assert regenerated.role == "assessment"
    assert regenerated.text == "Regenerated: Original question"
    assert regenerated.reference_answer == "B-tree, GIN, ... (v2)"
    assert llm.calls == 1


@pytest.mark.anyio
async def test_approve_rejects_assessment_question_without_reference_answer(
    db_session: AsyncSession,
) -> None:
    """Комплект приходит от LLM прямо в approve — если она вернула assessment-вопрос
    без эталонного ответа, вакансия не активируется."""
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService(
        questions=[
            GeneratedQuestion(
                text="Вопрос про Python",
                role="assessment",
                skill_tag=["Python"],
                intent="intent",
                reference_answer=None,
                estimated_duration_sec=180,
            ),
            GeneratedQuestion(text="Вопрос про PostgreSQL", role="assessment",
                              skill_tag=["PostgreSQL"], intent="i", reference_answer="r",
                              estimated_duration_sec=180),
            GeneratedQuestion(text="Вопрос про Docker", role="assessment", skill_tag=["Docker"],
                              intent="i", reference_answer="r", estimated_duration_sec=180),
        ]
    )
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
        requirements=_THREE,
    )
    await service.send_to_expert(vacancy.id)

    with pytest.raises(VacancyNotReadyError) as exc_info:
        await service.approve_vacancy(vacancy.id)
    assert len(exc_info.value.question_ids) == 1
    assert (await service.get_vacancy(vacancy.id)).status == "calibration"


@pytest.mark.anyio
async def test_approve_rejects_questions_missing_a_requirement(db_session: AsyncSession) -> None:
    """Требование без единого вопроса — дыра в интервью; раньше она проезжала молча."""
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService(
        questions=[
            GeneratedQuestion(text="Вопрос про Python", role="assessment", skill_tag=["Python"],
                              intent="i", reference_answer="r", estimated_duration_sec=180),
        ]
    )
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id, title="Backend", description="...", grade="middle",
        required_skills=[], nice_to_have_skills=[], requirements=_THREE,
    )
    await service.send_to_expert(vacancy.id)

    with pytest.raises(RequirementCoverageError) as exc_info:
        await service.approve_vacancy(vacancy.id)
    assert exc_info.value.missing == ["PostgreSQL", "Docker"]


@pytest.mark.anyio
async def test_approve_generates_questions_and_activates(db_session: AsyncSession) -> None:
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
        requirements=_THREE,
    )
    assert await service.list_questions(vacancy.id) == []
    await service.send_to_expert(vacancy.id)

    approved = await service.approve_vacancy(vacancy.id)

    assert approved.status == "active"
    questions = await service.list_questions(vacancy.id)
    assert [q.role for q in questions] == ["warmup", "assessment", "assessment", "assessment", "closing"]
    assert [q.skill_tag[0] for q in questions if q.role == "assessment"] == [
        "Python", "PostgreSQL", "Docker"
    ]


@pytest.mark.anyio
async def test_approve_populates_stt_terms(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService()
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id, title="Backend", description="...", grade="middle",
        required_skills=[], nice_to_have_skills=[], requirements=_THREE,
    )
    await service.send_to_expert(vacancy.id)
    await service.approve_vacancy(vacancy.id)

    questions = await service.list_questions(vacancy.id)
    assert questions[0].stt_terms == ["PostgreSQL", "B-tree"]


@pytest.mark.anyio
async def test_approve_survives_stt_terms_failure(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    llm = FakeVacancyLLMService()

    async def _boom(*_args, **_kwargs):
        raise RuntimeError("LLM down")

    llm.generate_stt_terms = _boom  # type: ignore[assignment]
    service = _make_service(db_session, llm_service=llm)

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id, title="Backend", description="...", grade="middle",
        required_skills=[], nice_to_have_skills=[], requirements=_THREE,
    )
    await service.send_to_expert(vacancy.id)
    approved = await service.approve_vacancy(vacancy.id)

    assert approved.status == "active"
    questions = await service.list_questions(vacancy.id)
    assert all(q.stt_terms is None for q in questions)


@pytest.mark.anyio
async def test_ready_vacancy_locks_mutations(db_session: AsyncSession) -> None:
    recruiter = await _make_recruiter(db_session)
    service = _make_service(db_session, llm_service=FakeVacancyLLMService())

    vacancy = await service.create_vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="...",
        grade="middle",
        required_skills=[],
        nice_to_have_skills=[],
        requirements=_THREE,
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
