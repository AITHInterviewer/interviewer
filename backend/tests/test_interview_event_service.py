"""`InterviewEventService`: полный лог `interview_event` + агрегация `Answer` из тех же
сырых событий (план, «interview_event_service.py»)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.interview_event import InterviewEvent
from app.models.question import Question
from app.services.interview_event_service import InterviewEventService
from tests.conftest import seed_demo_interview


@pytest.mark.anyio
async def test_record_event_always_inserts_raw_event(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, question_count=0)
    service = InterviewEventService(db_session)

    await service.record_event(interview.id, {"type": "interview_started", "payload": {}})
    await service.record_event(interview.id, {"type": "agent_utterance", "payload": {"text": "Привет"}})

    events = (
        (await db_session.execute(select(InterviewEvent).where(InterviewEvent.interview_id == interview.id)))
        .scalars()
        .all()
    )
    assert {e.event_type for e in events} == {"interview_started", "agent_utterance"}


@pytest.mark.anyio
async def test_question_lifecycle_aggregates_into_answer(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()
    service = InterviewEventService(db_session)

    ts_start = datetime(2026, 9, 5, 10, 0, tzinfo=timezone.utc).isoformat()
    await service.record_event(
        interview.id,
        {
            "type": "question_started",
            "question_id": str(question.id),
            "payload": {"text": "Расскажите про индексы"},
            "ts": ts_start,
        },
    )
    await service.record_event(
        interview.id,
        {
            "type": "candidate_utterance",
            "question_id": str(question.id),
            "payload": {"text": "Использую B-tree"},
        },
    )
    await service.record_event(
        interview.id,
        {
            "type": "candidate_utterance",
            "question_id": str(question.id),
            "payload": {"text": " и GIN."},
        },
    )
    ts_completed = datetime(2026, 9, 5, 10, 2, tzinfo=timezone.utc).isoformat()
    await service.record_event(
        interview.id,
        {"type": "question_completed", "question_id": str(question.id), "ts": ts_completed},
    )

    answer = (
        await db_session.execute(select(Answer).where(Answer.question_id == question.id))
    ).scalar_one()

    # SQLite не хранит tzinfo — сравниваем naive datetime (значения UTC по построению).
    assert answer.role == question.role
    assert answer.transcript_text == "Использую B-tree и GIN."
    assert answer.started_at.replace(tzinfo=None) == datetime(2026, 9, 5, 10, 0)
    assert answer.completed_at.replace(tzinfo=None) == datetime(2026, 9, 5, 10, 2)

    events = (
        (await db_session.execute(select(InterviewEvent).where(InterviewEvent.interview_id == interview.id)))
        .scalars()
        .all()
    )
    assert len(events) == 4


@pytest.mark.anyio
async def test_unresolvable_question_id_still_records_raw_event_without_answer(
    db_session: AsyncSession,
) -> None:
    interview = await seed_demo_interview(db_session, question_count=0)
    service = InterviewEventService(db_session)

    await service.record_event(
        interview.id, {"type": "question_started", "question_id": "q1", "payload": {"text": "..."}}
    )

    events = (
        (await db_session.execute(select(InterviewEvent).where(InterviewEvent.interview_id == interview.id)))
        .scalars()
        .all()
    )
    answers = (await db_session.execute(select(Answer))).scalars().all()

    assert len(events) == 1
    assert answers == []


@pytest.mark.anyio
async def test_record_candidate_input_code_writes_answer_and_event(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()
    question.format = "live_coding"
    question.stimulus = {"language": "python"}
    await db_session.commit()

    service = InterviewEventService(db_session)
    await service.record_candidate_input(
        interview.id,
        {
            "type": "candidate_input",
            "question_id": str(question.id),
            "input_format": "code",
            "content": "def two_sum(nums, target): ...",
        },
    )

    answer = (
        await db_session.execute(select(Answer).where(Answer.question_id == question.id))
    ).scalar_one()
    assert answer.code_submission == "def two_sum(nums, target): ..."
    assert answer.code_language == "python"
    assert len(answer.code_snapshots) == 1

    events = (
        (await db_session.execute(select(InterviewEvent).where(InterviewEvent.interview_id == interview.id)))
        .scalars()
        .all()
    )
    assert len(events) == 1
    assert events[0].event_type == "candidate_input"


@pytest.mark.anyio
async def test_record_candidate_input_non_code_only_records_event(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()
    service = InterviewEventService(db_session)

    await service.record_candidate_input(
        interview.id,
        {"type": "candidate_input", "question_id": str(question.id), "input_format": "none", "content": ""},
    )

    answers = (await db_session.execute(select(Answer))).scalars().all()
    assert answers == []
