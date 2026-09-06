"""Тесты воркера и LLM-судьи evaluation-agent."""

from __future__ import annotations

from typing import Any, Self
from uuid import uuid4

import pytest

from evaluation_agent.config import settings
from evaluation_agent.llm_judge import (
    ClaudeAgentSDKJudge,
    DummyLLMJudge,
    KimiJudge,
    QuestionToScore,
    VacancyContext,
    get_judge,
)
from evaluation_agent.worker import process_job


class FakeBackendClient:
    def __init__(self, evaluation_input: dict[str, Any]) -> None:
        self.evaluation_input = evaluation_input
        self.posted: dict[str, Any] | None = None
        self.completed_job_id: str | None = None
        self.failed: dict[str, Any] | None = None

    async def get_evaluation_input(self, interview_id: str) -> dict[str, Any]:
        return self.evaluation_input

    async def post_evaluation(self, interview_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.posted = payload
        return {"id": str(uuid4())}

    async def complete_evaluation_job(self, job_id: str) -> None:
        self.completed_job_id = job_id

    async def fail_evaluation_job(self, job_id: str, error: str) -> None:
        self.failed = {"job_id": job_id, "error": error}

    async def close(self) -> None:
        pass

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        pass


def test_get_judge_selects_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "evaluation_llm_provider", "claude")
    assert isinstance(get_judge(), ClaudeAgentSDKJudge)

    monkeypatch.setattr(settings, "evaluation_llm_provider", "kimi")
    assert isinstance(get_judge(), KimiJudge)

    monkeypatch.setattr(settings, "evaluation_llm_provider", "dummygpt")
    assert isinstance(get_judge(), DummyLLMJudge)


def test_get_judge_rejects_unknown_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "evaluation_llm_provider", "unknown")
    with pytest.raises(ValueError, match="Unsupported EVALUATION_LLM_PROVIDER"):
        get_judge()


@pytest.mark.asyncio
async def test_dummy_judge_scores_overlap() -> None:
    judge = DummyLLMJudge()
    question = QuestionToScore(
        question_id="q1",
        text="What is Python GIL?",
        reference_answer="Global Interpreter Lock allows only one thread at a time.",
        intent="check threading knowledge",
        difficulty="baseline",
        format="voice",
        skill_tags=["Python"],
        transcript="The Global Interpreter Lock means only one thread runs at a time.",
        answered_with_hint=False,
        vacancy=VacancyContext(
            title="Python Backend Dev",
            description="backend role",
            grade="middle",
            required_skills=["Python"],
            nice_to_have_skills=[],
        ),
    )
    result = await judge.judge(question)
    assert len(result.skill_scores) == 1
    assert result.skill_scores[0].skill_tag == "Python"
    assert result.skill_scores[0].score == 3  # полное перекрытие эталона — максимум шкалы 0-3
    assert result.report is not None
    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.asyncio
async def test_dummy_judge_empty_transcript_is_zero() -> None:
    judge = DummyLLMJudge()
    question = QuestionToScore(
        question_id="q1",
        text="Any question",
        reference_answer="some answer",
        intent=None,
        difficulty="baseline",
        format="voice",
        skill_tags=["X"],
        transcript="",
        answered_with_hint=False,
        vacancy=VacancyContext(
            title="Role", description="desc", grade="junior", required_skills=["X"], nice_to_have_skills=[]
        ),
    )
    result = await judge.judge(question)
    assert result.skill_scores[0].score == 0


@pytest.mark.asyncio
async def test_process_job_posts_evaluation_and_completes_job() -> None:
    interview_id = str(uuid4())
    job_id = str(uuid4())
    evaluation_input = {
        "interview": {"id": interview_id, "candidate_name": "Alice"},
        "vacancy": {
            "title": "Backend Dev",
            "description": "build backends",
            "grade": "middle",
            "required_skills": ["Python"],
            "nice_to_have_skills": [],
        },
        "questions": [
            {
                "question_id": str(uuid4()),
                "text": "What is GIL?",
                "skill_tag": ["Python"],
                "intent": "threading",
                "reference_answer": "Global Interpreter Lock.",
                "difficulty": "baseline",
                "format": "voice",
                "role": "assessment",
                "dynamic_trigger": None,
                "source": "base_generated",
                "answer": {
                    "transcript_text": "Global Interpreter Lock allows one thread.",
                    "started_at": "2026-09-05T12:00:00+00:00",
                },
                "answered_with_hint": False,
            }
        ],
        "events": [],
    }
    backend = FakeBackendClient(evaluation_input)
    judge = DummyLLMJudge()

    await process_job({"id": job_id, "interview_id": interview_id}, backend, judge)

    assert backend.posted is not None
    assert backend.posted["verdict"] == "fits"
    assert len(backend.posted["per_question"]) == 1
    assert backend.posted["per_question"][0]["skill_scores"][0]["skill_tag"] == "Python"
    assert backend.posted["per_question"][0]["report"] is not None
    assert backend.posted["per_question"][0]["quotes"] == [
        {"text": backend.posted["per_question"][0]["quotes"][0]["text"], "question_id": evaluation_input["questions"][0]["question_id"]}
    ]
    assert backend.completed_job_id == job_id
    assert backend.failed is None
    assert "summary_intro" in backend.posted
    assert "summary_conclusion" in backend.posted


@pytest.mark.asyncio
async def test_process_job_skips_question_without_transcript() -> None:
    interview_id = str(uuid4())
    job_id = str(uuid4())
    evaluation_input = {
        "interview": {"id": interview_id, "candidate_name": "Bob"},
        "vacancy": {
            "title": "Backend Dev",
            "description": "build backends",
            "grade": "middle",
            "required_skills": ["Python"],
            "nice_to_have_skills": [],
        },
        "questions": [
            {
                "question_id": str(uuid4()),
                "text": "What is GIL?",
                "skill_tag": ["Python"],
                "intent": "threading",
                "reference_answer": "Global Interpreter Lock.",
                "difficulty": "baseline",
                "format": "voice",
                "role": "assessment",
                "dynamic_trigger": None,
                "source": "base_generated",
                "answer": None,
                "answered_with_hint": False,
            }
        ],
        "events": [],
    }
    backend = FakeBackendClient(evaluation_input)
    judge = DummyLLMJudge()

    await process_job({"id": job_id, "interview_id": interview_id}, backend, judge)

    assert backend.posted is not None
    # Обязательный навык без единого ответа -> 0% взвешенной шкалы -> not_fits
    assert backend.posted["verdict"] == "not_fits"
    assert backend.posted["per_question"] == []
    assert backend.completed_job_id == job_id


@pytest.mark.asyncio
async def test_process_job_reports_failure_on_evaluation_input_error() -> None:
    class FailingBackendClient(FakeBackendClient):
        async def get_evaluation_input(self, interview_id: str) -> dict[str, Any]:
            raise RuntimeError("boom")

    interview_id = str(uuid4())
    job_id = str(uuid4())
    backend = FailingBackendClient({})
    judge = DummyLLMJudge()

    await process_job({"id": job_id, "interview_id": interview_id}, backend, judge)

    assert backend.failed is not None
    assert backend.failed["job_id"] == job_id
    assert "boom" in backend.failed["error"]
