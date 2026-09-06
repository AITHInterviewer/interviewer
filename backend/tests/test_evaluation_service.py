"""`EvaluationService.evaluate_interview` — агрегация per_question/skill_verdicts/verdict,
плюс аргументы (reasoning) по каждому навыку и итоговая сводка (summary/strengths/weaknesses).

Реальный OpenRouter-вызов (`_score_answer`/`_summarize`) не тестируем сетью — подменяем его,
аналог `FakeVacancyLLMService` в `test_vacancy_service.py`. Сам HTTP-паттерн 1:1 списан с
`vacancy_llm_service.py`, который уже проверен в проде.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.models.answer import Answer
from app.models.question import Question
from app.models.vacancy import Vacancy
from app.services.evaluation_service import EvaluationService, _AnswerScore, _SummaryText


def _vacancy(**kwargs) -> Vacancy:
    return Vacancy(
        id=uuid.uuid4(),
        recruiter_id=uuid.uuid4(),
        title="Backend",
        description="...",
        grade="middle",
        required_skills=kwargs.pop("required_skills", ["python", "sql"]),
        **kwargs,
    )


def _question(**kwargs) -> Question:
    return Question(
        id=uuid.uuid4(),
        vacancy_id=uuid.uuid4(),
        text="Q",
        order=kwargs.pop("order", 0),
        estimated_duration_sec=180,
        source="base_manual",
        **kwargs,
    )


def _answer(question_id: uuid.UUID, transcript_text: str) -> Answer:
    return Answer(
        id=uuid.uuid4(),
        interview_id=uuid.uuid4(),
        question_id=question_id,
        role="assessment",
        transcript_text=transcript_text,
        started_at=datetime(2026, 9, 6, tzinfo=timezone.utc),
    )


def _stub_summarize(monkeypatch: pytest.MonkeyPatch, service: EvaluationService) -> None:
    async def fake_summarize(skill_verdicts: list[dict]) -> _SummaryText:
        return _SummaryText(summary="итог", strengths="сильные стороны", weaknesses="слабые стороны")

    monkeypatch.setattr(service, "_summarize", fake_summarize)


@pytest.mark.anyio
async def test_evaluate_interview_builds_report_and_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    vacancy = _vacancy()
    q_python = _question(skill_tag=["python"], role="assessment", difficulty="baseline")
    q_sql = _question(skill_tag=["sql"], role="assessment", difficulty="baseline")
    q_warmup = _question(skill_tag=[], role="warmup", difficulty="baseline")
    answers = [
        _answer(q_python.id, "Использую GIL и т.п."),
        _answer(q_sql.id, "Не знаю"),
        _answer(q_warmup.id, "Привет"),
    ]

    service = EvaluationService(api_key="unused")
    _stub_summarize(monkeypatch, service)

    async def fake_score(question: Question, answer: Answer) -> _AnswerScore:
        if question.id == q_python.id:
            return _AnswerScore(score=4, answered_with_hint=False, rationale="Ответ по существу")
        return _AnswerScore(score=1, answered_with_hint=False, rationale="Не ответил")

    monkeypatch.setattr(service, "_score_answer", fake_score)

    report = await service.evaluate_interview(vacancy, [q_python, q_sql, q_warmup], answers)

    assert report["verdict"] == "not_fits"  # sql провален -> не подходит
    assert len(report["per_question"]) == 2  # warmup без транскрипта в скоринг не идёт
    assert report["summary"] == "итог"
    assert report["strengths"] == "сильные стороны"
    assert report["weaknesses"] == "слабые стороны"

    skill_by_tag = {sv["skill_tag"]: sv for sv in report["skill_verdicts"]}
    assert skill_by_tag["python"]["skill_class"] == "pass"
    assert skill_by_tag["python"]["mastery_level"] == 3
    assert skill_by_tag["python"]["reasoning"] == ["Вопрос 0 (4/5): Ответ по существу"]
    assert skill_by_tag["sql"]["skill_class"] == "fail"
    assert skill_by_tag["sql"]["mastery_level"] == 1

    assert len(report["verdict_reasoning"]) == 2  # оба навыка обязательные
    assert any("sql" in line for line in report["verdict_reasoning"])


@pytest.mark.anyio
async def test_evaluate_interview_skips_unanswered_and_non_assessment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vacancy = _vacancy(required_skills=["python"])
    q_python = _question(skill_tag=["python"], role="assessment")
    q_closing = _question(skill_tag=[], role="closing")
    answers = [_answer(q_python.id, ""), _answer(q_closing.id, "Спасибо")]

    service = EvaluationService(api_key="unused")
    _stub_summarize(monkeypatch, service)
    calls = 0

    async def fake_score(question: Question, answer: Answer) -> _AnswerScore:
        nonlocal calls
        calls += 1
        return _AnswerScore(score=5)

    monkeypatch.setattr(service, "_score_answer", fake_score)

    report = await service.evaluate_interview(vacancy, [q_python, q_closing], answers)

    assert calls == 0  # пустая расшифровка и closing-вопрос не оцениваются
    assert report["per_question"] == []
    assert report["skill_verdicts"][0]["skill_class"] == "untested"
    assert report["skill_verdicts"][0]["mastery_level"] is None


@pytest.mark.anyio
async def test_summarize_skips_llm_call_when_no_skill_verdicts() -> None:
    service = EvaluationService(api_key="unused")
    summary = await service._summarize([])
    assert "не ответил" in summary.summary.lower()
