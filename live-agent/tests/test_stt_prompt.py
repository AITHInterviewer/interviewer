"""`agent._build_stt_prompt` — сборка подсказки Whisper из терминов вопроса + навыков
вакансии (см. agent.py, гипотеза H4)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ainterviewer.agent import _STT_PROMPT_MAX_CHARS, _build_stt_prompt  # noqa: E402
from ainterviewer.schema import Question, Vacancy  # noqa: E402


def _question(**kw) -> Question:
    base = dict(id="q1", text="t", intent="i", reference_answer="r")
    return Question(**{**base, **kw})


def test_question_terms_come_first_then_vacancy_skills() -> None:
    vacancy = Vacancy(title="T", grade="middle", required_skills=["Python"], nice_to_have_skills=["Docker"])
    prompt = _build_stt_prompt(vacancy, _question(stt_terms=["PostgreSQL", "B-tree"]))
    assert prompt == "PostgreSQL, B-tree, Python, Docker"


def test_dedupes_case_insensitively_keeping_first_spelling() -> None:
    vacancy = Vacancy(title="T", grade="m", required_skills=["python"], nice_to_have_skills=[])
    prompt = _build_stt_prompt(vacancy, _question(stt_terms=["Python"]))
    assert prompt == "Python"


def test_no_question_falls_back_to_vacancy_skills() -> None:
    vacancy = Vacancy(title="T", grade="m", required_skills=["Kafka"], nice_to_have_skills=["Redis"])
    assert _build_stt_prompt(vacancy, None) == "Kafka, Redis"


def test_truncated_to_whisper_budget() -> None:
    vacancy = Vacancy(
        title="T", grade="m",
        required_skills=[f"term{i}" for i in range(500)], nice_to_have_skills=[],
    )
    assert len(_build_stt_prompt(vacancy, None)) <= _STT_PROMPT_MAX_CHARS
