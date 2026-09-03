"""Регрессионные тесты графа live-контура — на FakeLLM, без сети/Docker/LiveKit.

Эти тесты и есть проверка "граф понятен и объясним": каждый называет конкретную ветку
из раздела 2.3.1 архитектурного документа и проверяет её именно кодом, а не на глаз.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ainterviewer.events import EventLog, EventType  # noqa: E402
from ainterviewer.llm_client import FakeLLM  # noqa: E402
from ainterviewer.schema import Candidate, InterviewInput, Question, Vacancy  # noqa: E402
from ainterviewer.state_machine import LiveContourEngine, Phase  # noqa: E402


def make_interview(n_questions: int = 2) -> InterviewInput:
    return InterviewInput(
        interview_id="test",
        vacancy=Vacancy(title="Тестовая вакансия", grade="middle"),
        candidate=Candidate(name="Тест Тестов"),
        questions=[
            Question(
                id=f"q{i}",
                text=f"Вопрос {i}?",
                intent="проверка",
                reference_answer="эталон",
            )
            for i in range(1, n_questions + 1)
        ],
    )


@pytest.fixture
def engine(tmp_path):
    events = EventLog(tmp_path / "events.jsonl")
    interview = make_interview()
    return LiveContourEngine(interview, FakeLLM(), events)


@pytest.mark.asyncio
async def test_start_asks_first_question(engine):
    first = await engine.start()
    assert first == "Вопрос 1?"
    assert engine.state.current.question.id == "q1"


@pytest.mark.asyncio
async def test_continue_does_not_advance(engine):
    await engine.start()
    reply = await engine.on_candidate_final_turn("эм, секунду...")
    assert reply is None
    assert engine.state.question_index == 0  # остались на том же вопросе


@pytest.mark.asyncio
async def test_exhaustive_advances_to_next_question(engine):
    await engine.start()
    long_answer = "Развёрнутый содержательный ответ на первый вопрос про всё подряд."
    reply = await engine.on_candidate_final_turn(long_answer)
    assert engine.state.question_index == 1
    assert "Вопрос 2?" in reply


@pytest.mark.asyncio
async def test_ambiguous_then_confirm_advances(engine):
    await engine.start()
    await engine.on_candidate_final_turn("коротко")  # AMBIGUOUS -> чек-ин
    assert engine.state.current.checkin_used is True
    assert engine.state.question_index == 0

    reply = await engine.on_candidate_final_turn("да всё")  # AMBIGUOUS повторно (короткая фраза)
    # чек-ин уже использован -> вторая неоднозначность не спрашивает снова, а завершает вопрос
    assert engine.state.question_index == 1
    assert reply is not None


@pytest.mark.asyncio
async def test_leading_hint_consumes_adaptive_budget(engine):
    await engine.start()
    budget_before = engine.state.adaptive_budget_remaining
    await engine.on_candidate_final_turn("я не знаю ответа на этот вопрос")
    assert engine.state.adaptive_budget_remaining == budget_before - 1
    assert engine.state.current.hint_used is True


@pytest.mark.asyncio
async def test_interview_completes_after_last_question(engine):
    await engine.start()
    await engine.on_candidate_final_turn("Развёрнутый ответ на первый вопрос, вполне достаточный.")
    assert engine.state.phase != Phase.DONE
    await engine.on_candidate_final_turn("Развёрнутый ответ на второй вопрос, тоже достаточный.")
    assert engine.state.phase == Phase.DONE


@pytest.mark.asyncio
async def test_event_log_has_matching_start_and_complete(tmp_path):
    events = EventLog(tmp_path / "events.jsonl")
    interview = make_interview(n_questions=1)
    engine = LiveContourEngine(interview, FakeLLM(), events)

    await engine.start()
    await engine.on_candidate_final_turn("Развёрнутый ответ, вполне достаточный по содержанию.")

    types = [e.type for e in events.events]
    assert types[0] == EventType.INTERVIEW_STARTED
    assert types[-1] == EventType.INTERVIEW_COMPLETED
    assert EventType.QUESTION_COMPLETED in types
