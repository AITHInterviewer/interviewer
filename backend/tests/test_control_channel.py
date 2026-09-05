import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question
from app.services.control_channel import to_control_event
from tests.conftest import seed_demo_interview


@pytest.mark.anyio
async def test_question_started_maps_to_question_with_input_format_none(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()

    event = await to_control_event(
        db_session,
        {
            "type": "question_started",
            "question_id": str(question.id),
            "payload": {"text": "Расскажите про индексы в Postgres"},
            "ts": "2026-09-04T10:00:00Z",
        },
    )

    assert event == {
        "type": "question",
        "question_id": str(question.id),
        "text": "Расскажите про индексы в Postgres",
        "input_format": "none",
        "code_language": None,
        "ts": "2026-09-04T10:00:00Z",
        "question_index": None,
        "questions_total": None,
    }
    assert interview.status == "created"  # интервью не тронуто — control_channel не решает


@pytest.mark.anyio
async def test_question_started_carries_index_and_total_for_roadmap(db_session: AsyncSession) -> None:
    """US2 — роадмап прогресса на фронте: question_index/questions_total из payload
    live-agent прокидываются в ControlEvent как есть."""
    await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()

    event = await to_control_event(
        db_session,
        {
            "type": "question_started",
            "question_id": str(question.id),
            "payload": {"text": "...", "index": 2, "questions_total": 5},
        },
    )

    assert event is not None
    assert event["question_index"] == 2
    assert event["questions_total"] == 5


@pytest.mark.anyio
async def test_question_completed_maps_to_transition(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, question_count=1)

    event = await to_control_event(
        db_session, {"type": "question_completed", "question_id": "q-1", "payload": {"reason": "exhaustive"}}
    )

    assert event is not None
    assert event["type"] == "transition"
    assert event["question_id"] == "q-1"


@pytest.mark.anyio
async def test_interview_completed_maps_to_completed(db_session: AsyncSession) -> None:
    event = await to_control_event(db_session, {"type": "interview_completed", "payload": {}})

    assert event is not None
    assert event["type"] == "completed"
    assert event["text"] == "Спасибо, ответы отправлены на обработку"


@pytest.mark.anyio
async def test_internal_event_types_are_not_translated(db_session: AsyncSession) -> None:
    internal_event_types = (
        "backchannel_played",
        "candidate_utterance",
        "live_control_decision",
        "agent_utterance",
        "interview_started",
    )
    for event_type in internal_event_types:
        assert await to_control_event(db_session, {"type": event_type, "payload": {}}) is None


@pytest.mark.anyio
async def test_unresolvable_question_id_falls_back_to_input_format_none(db_session: AsyncSession) -> None:
    """live-agent пока читает мок-вакансию — её question_id не совпадает с Postgres UUID
    (см. control_channel.py, docstring `_resolve_input_format`)."""
    event = await to_control_event(
        db_session, {"type": "question_started", "question_id": "q1", "payload": {"text": "..."}}
    )

    assert event is not None
    assert event["input_format"] == "none"
