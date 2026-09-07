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
from ainterviewer.llm_client import FakeLLM, LiveControlLLM  # noqa: E402
from ainterviewer.prompts import EXPLAIN_SOLUTION_PHRASES, NUDGE_PHRASES  # noqa: E402
from ainterviewer.schema import Candidate, InterviewInput, Question, Vacancy  # noqa: E402
from ainterviewer.state_machine import (  # noqa: E402
    CODING_FOLLOWUP_LIMIT,
    CODING_HINT_LIMIT,
    LiveContourEngine,
    Phase,
)


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


def make_coding_interview() -> InterviewInput:
    """Первый вопрос — format="live_coding", второй — обычный voice, чтобы проверить и
    саму фазу CODING, и переход дальше по интервью после неё."""
    return InterviewInput(
        interview_id="test-coding",
        vacancy=Vacancy(title="Тестовая вакансия", grade="middle"),
        candidate=Candidate(name="Тест Тестов"),
        questions=[
            Question(
                id="q1",
                text="Напишите функцию, которая переворачивает строку.",
                intent="базовая работа со строками",
                reference_answer="reversed()/срез [::-1]",
                format="live_coding",
                stimulus={"language": "python"},
                estimated_duration_sec=600,
            ),
            Question(id="q2", text="Вопрос 2?", intent="проверка", reference_answer="эталон"),
        ],
    )


@pytest.fixture
def coding_engine(tmp_path):
    events = EventLog(tmp_path / "events.jsonl")
    interview = make_coding_interview()
    return LiveContourEngine(interview, FakeLLM(), events)


class RecordingLLM(LiveControlLLM):
    """Оборачивает `FakeLLM`, только чтобы сохранить (system_prompt, turn_prompt) каждого
    вызова — для тестов, которым нужно проверить, что именно ушло в LLM (например, что код
    кандидата попал в промпт фазы объяснения)."""

    def __init__(self):
        self._fake = FakeLLM()
        self.calls: list[tuple[str, str]] = []

    async def decide(self, system_prompt, turn_prompt):
        self.calls.append((system_prompt, turn_prompt))
        return await self._fake.decide(system_prompt, turn_prompt)


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
async def test_nudge_once_only_while_candidate_silent(engine):
    await engine.start()
    first = engine.nudge()
    assert first in NUDGE_PHRASES
    assert engine.nudge() is None  # не более одной подсказки на вопрос
    assert engine.state.current.nudge_used is True


@pytest.mark.asyncio
async def test_nudge_noop_after_candidate_spoke(engine):
    await engine.start()
    await engine.on_candidate_final_turn("эм, секунду...")  # continue — остаёмся на вопросе
    assert engine.nudge() is None  # кандидат уже что-то сказал — не подбадриваем


@pytest.mark.asyncio
async def test_skip_current_question_advances(engine):
    await engine.start()
    assert engine.state.question_index == 0
    reply = await engine.skip_current_question(reason="candidate_skip")
    assert engine.state.question_index == 1
    assert "Вопрос 2?" in reply
    reasons = [e.payload.get("reason") for e in engine.events.events if e.type == EventType.QUESTION_COMPLETED]
    assert "candidate_skip" in reasons


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


# -- format="live_coding" (Phase.CODING) ------------------------------------------------


@pytest.mark.asyncio
async def test_start_enters_coding_phase_for_live_coding_question(coding_engine):
    await coding_engine.start()
    assert coding_engine.state.phase == Phase.CODING
    assert coding_engine.state.current.question.id == "q1"


@pytest.mark.asyncio
async def test_coding_continue_stays_in_coding(coding_engine):
    await coding_engine.start()
    reply = await coding_engine.on_candidate_final_turn("хм, думаю над этим")
    assert reply is None
    assert coding_engine.state.phase == Phase.CODING
    assert coding_engine.state.current.hints_used == 0


@pytest.mark.asyncio
async def test_coding_stuck_utterance_gives_hint(coding_engine):
    await coding_engine.start()
    reply = await coding_engine.on_candidate_final_turn("я застрял, не понимаю задачу")
    assert reply is not None
    assert coding_engine.state.phase == Phase.CODING  # подсказка не завершает решение
    assert coding_engine.state.current.hints_used == 1
    hint_events = [e for e in coding_engine.events.events if e.type == EventType.CODING_HINT_GIVEN]
    assert len(hint_events) == 1
    assert hint_events[0].payload["trigger"] == "candidate_stuck"


@pytest.mark.asyncio
async def test_coding_hint_limit_enforced_across_triggers(coding_engine):
    """Голосовые подсказки и подсказки "по тишине" (maybe_request_coding_hint) делят один
    и тот же лимит на вопрос — не два независимых по CODING_HINT_LIMIT каждый."""
    await coding_engine.start()
    for _ in range(CODING_HINT_LIMIT):
        reply = await coding_engine.on_candidate_final_turn("я застрял, не понимаю")
        assert reply is not None
    assert coding_engine.state.current.hints_used == CODING_HINT_LIMIT

    assert await coding_engine.on_candidate_final_turn("я застрял, не понимаю") is None
    assert await coding_engine.maybe_request_coding_hint() is None
    hint_events = [e for e in coding_engine.events.events if e.type == EventType.CODING_HINT_GIVEN]
    assert len(hint_events) == CODING_HINT_LIMIT


@pytest.mark.asyncio
async def test_coding_done_leaves_coding_phase(coding_engine):
    await coding_engine.start()
    coding_engine.update_code("def reverse(s): return s[::-1]")
    reply = await coding_engine.on_candidate_final_turn("готово, я закончил")
    assert coding_engine.state.phase != Phase.CODING
    assert coding_engine.state.question_index == 0  # тот же вопрос — просто фаза объяснения
    assert reply in EXPLAIN_SOLUTION_PHRASES
    submitted = [e for e in coding_engine.events.events if e.type == EventType.CANDIDATE_CODE_SUBMITTED]
    assert len(submitted) == 1
    assert submitted[0].payload["content"] == "def reverse(s): return s[::-1]"
    assert submitted[0].payload["language"] == "python"
    assert submitted[0].payload["reason"] == "candidate_said_done"


@pytest.mark.asyncio
async def test_explanation_prompt_includes_candidate_code(tmp_path):
    events = EventLog(tmp_path / "events.jsonl")
    interview = make_coding_interview()
    llm = RecordingLLM()
    engine = LiveContourEngine(interview, llm, events)

    await engine.start()
    engine.update_code("def reverse(s):\n    return s[::-1]")
    await engine.on_candidate_final_turn("готово, я закончил")  # уходим из Phase.CODING
    await engine.on_candidate_final_turn("Развёрнутый ответ, вполне достаточный по содержанию.")

    _, last_turn_prompt = llm.calls[-1]
    assert "def reverse(s):" in last_turn_prompt


@pytest.mark.asyncio
async def test_coding_followup_budget_enforced(coding_engine):
    """Фаза объяснения после live_coding — отдельный per-question лимит доп. вопросов
    (CODING_FOLLOWUP_LIMIT), не общий adaptive_budget_remaining."""
    await coding_engine.start()
    await coding_engine.on_candidate_final_turn("готово, я закончил")
    assert coding_engine.state.phase != Phase.CODING

    for _ in range(CODING_FOLLOWUP_LIMIT):
        reply = await coding_engine.on_candidate_final_turn("я не знаю")
        assert coding_engine.state.question_index == 0
        assert reply is not None
    assert coding_engine.state.current.followups_used == CODING_FOLLOWUP_LIMIT

    await coding_engine.on_candidate_final_turn("я не знаю")
    assert coding_engine.state.question_index == 1  # лимит исчерпан — перешли к следующему вопросу


@pytest.mark.asyncio
async def test_skip_during_coding_emits_code_submitted(coding_engine):
    await coding_engine.start()
    coding_engine.update_code("partial solution")
    await coding_engine.skip_current_question(reason="candidate_skip")
    submitted = [e for e in coding_engine.events.events if e.type == EventType.CANDIDATE_CODE_SUBMITTED]
    assert len(submitted) == 1
    assert submitted[0].payload["content"] == "partial solution"
    assert coding_engine.state.question_index == 1


@pytest.mark.asyncio
async def test_force_finish_coding_leaves_coding_not_skip(coding_engine):
    await coding_engine.start()
    coding_engine.update_code("some code")
    reply = await coding_engine.force_finish_coding(reason="time_limit")
    assert coding_engine.state.phase != Phase.CODING
    assert coding_engine.state.question_index == 0  # не пропустили вопрос — перешли к объяснению
    assert reply in EXPLAIN_SOLUTION_PHRASES
    submitted = [e for e in coding_engine.events.events if e.type == EventType.CANDIDATE_CODE_SUBMITTED]
    assert submitted[0].payload["reason"] == "time_limit"
