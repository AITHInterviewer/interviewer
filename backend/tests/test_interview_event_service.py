"""`InterviewEventService`: полный лог `interview_event` + агрегация `Answer` из тех же
сырых событий (план, «interview_event_service.py»)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.evaluation_job import EvaluationJob
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
async def test_question_started_persists_current_question(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()
    service = InterviewEventService(db_session)

    await service.record_event(
        interview.id,
        {
            "type": "question_started",
            "question_id": str(question.id),
            "payload": {"text": "Вопрос по индексам"},
        },
    )

    await db_session.refresh(interview)
    assert interview.current_question_id == question.id
    assert interview.current_question_text == "Вопрос по индексам"


@pytest.mark.anyio
async def test_adaptive_question_does_not_overwrite_current_question(db_session: AsyncSession) -> None:
    """Реальный найденный баг (2026-09-06): фронт держал текст текущего вопроса только в
    памяти вкладки из последнего ControlEvent, и adaptive_question/checkin тем же полем
    стирали основной вопрос — кандидат его больше не видел. current_question_text должен
    писаться ТОЛЬКО на question_started."""
    interview = await seed_demo_interview(db_session, question_count=1)
    question = (await db_session.execute(select(Question))).scalar_one()
    service = InterviewEventService(db_session)

    await service.record_event(
        interview.id,
        {"type": "question_started", "question_id": str(question.id), "payload": {"text": "Основной вопрос"}},
    )
    await service.record_event(
        interview.id,
        {
            "type": "adaptive_question_asked",
            "question_id": str(question.id),
            "payload": {"text": "Расскажите подробнее про индексы"},
        },
    )

    await db_session.refresh(interview)
    assert interview.current_question_text == "Основной вопрос"


@pytest.mark.anyio
async def test_question_started_with_unparsable_question_id_still_saves_text(
    db_session: AsyncSession,
) -> None:
    """Мок-вакансия/дев-данные шлют нерезолвящиеся id вроде "q1" (см. control_channel.py) —
    current_question_id в этом случае NULL, но текст всё равно сохраняем."""
    interview = await seed_demo_interview(db_session, question_count=0)
    service = InterviewEventService(db_session)

    await service.record_event(
        interview.id, {"type": "question_started", "question_id": "q1", "payload": {"text": "Мок-вопрос"}}
    )

    await db_session.refresh(interview)
    assert interview.current_question_id is None
    assert interview.current_question_text == "Мок-вопрос"


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


@pytest.mark.anyio
async def test_record_security_signal_logs_event_without_touching_answers(
    db_session: AsyncSession,
) -> None:
    interview = await seed_demo_interview(db_session, question_count=0)
    service = InterviewEventService(db_session)

    await service.record_security_signal(
        interview.id, {"type": "security_signal", "signal": "tab_hidden", "ts": "2026-09-06T00:00:00Z"}
    )

    events = (
        (await db_session.execute(select(InterviewEvent).where(InterviewEvent.interview_id == interview.id)))
        .scalars()
        .all()
    )
    assert len(events) == 1
    assert events[0].event_type == "security:tab_hidden"
    assert events[0].payload["signal"] == "tab_hidden"
    assert (await db_session.execute(select(Answer))).scalars().all() == []


@pytest.mark.anyio
async def test_interview_completed_marks_status_and_enqueues_evaluation_job(
    db_session: AsyncSession,
) -> None:
    """`interview_completed` больше не оценивает синхронно (см. `_handle_interview_completed`):
    статус + product_state + задача в outbox для evaluation-agent."""
    interview = await seed_demo_interview(db_session, question_count=1)
    service = InterviewEventService(db_session)

    await service.record_event(interview.id, {"type": "interview_completed", "payload": {}})

    await db_session.refresh(interview)
    assert interview.status == "completed"
    assert interview.product_state == "report_processing"
    job = (
        (
            await db_session.execute(
                select(EvaluationJob).where(EvaluationJob.interview_id == interview.id)
            )
        )
        .scalars()
        .one()
    )
    assert job.status == "pending"


@pytest.mark.anyio
async def test_interview_completed_twice_does_not_duplicate_job(
    db_session: AsyncSession,
) -> None:
    interview = await seed_demo_interview(db_session, question_count=1)
    service = InterviewEventService(db_session)

    await service.record_event(interview.id, {"type": "interview_completed", "payload": {}})
    await service.record_event(interview.id, {"type": "interview_completed", "payload": {}})

    jobs = (
        (
            await db_session.execute(
                select(EvaluationJob).where(EvaluationJob.interview_id == interview.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(jobs) == 1
