"""`GET /api/v1/interviews/{interview_id}/live-input` — shape, ordering, auth
(план `kind-fluttering-reef.md`, раздел 3), конвенции см. `test_vacancies_api.py`.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.interview import Interview
from app.models.question import Question
from app.models.user import InternalUser
from app.models.vacancy import Vacancy

AUTH_HEADERS = {"X-Live-Agent-Token": settings.live_agent_token}


async def _seed_interview_with_questions(session: AsyncSession) -> Interview:
    recruiter = InternalUser(email=f"{uuid.uuid4()}@example.com", name="Test Recruiter", password_hash="x")
    session.add(recruiter)
    await session.flush()

    vacancy = Vacancy(
        recruiter_id=recruiter.id,
        title="Backend Developer",
        description="Postgres, FastAPI",
        grade="middle",
        required_skills=["python"],
        nice_to_have_skills=["docker"],
    )
    session.add(vacancy)
    await session.flush()

    # Deliberately non-sequential creation order, sequential `order` values — the response
    # must follow `order`, not insertion/creation order.
    session.add_all(
        [
            Question(
                vacancy_id=vacancy.id,
                text="Third",
                order=2,
                skill_tag=["postgres"],
                intent="intent-3",
                reference_answer="ref-3",
                stt_terms=["gRPC", "protobuf"],
                estimated_duration_sec=180,
                source="base_manual",
            ),
            Question(
                vacancy_id=vacancy.id,
                text="First",
                order=0,
                skill_tag=["python"],
                intent="intent-1",
                reference_answer="ref-1",
                estimated_duration_sec=180,
                source="base_manual",
            ),
            Question(
                vacancy_id=vacancy.id,
                text="Second",
                order=1,
                estimated_duration_sec=120,
                source="base_manual",
            ),
        ]
    )
    await session.flush()

    interview = Interview(
        vacancy_id=vacancy.id,
        candidate_name="Ivan Petrov",
        resume_file_url="s3://bucket/resume.pdf",
        access_token=str(uuid.uuid4()),
        status="created",
    )
    session.add(interview)
    await session.commit()
    return interview


@pytest.mark.anyio
async def test_live_input_404_for_unknown_interview(client) -> None:
    response = await client.get(
        "/api/v1/interviews/00000000-0000-0000-0000-000000000000/live-input",
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_live_input_rejects_missing_token(client, db_session: AsyncSession) -> None:
    interview = await _seed_interview_with_questions(db_session)

    response = await client.get(f"/api/v1/interviews/{interview.id}/live-input")

    assert response.status_code in (401, 403)


@pytest.mark.anyio
async def test_live_input_rejects_wrong_token(client, db_session: AsyncSession) -> None:
    interview = await _seed_interview_with_questions(db_session)

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/live-input",
        headers={"X-Live-Agent-Token": "wrong-token"},
    )

    assert response.status_code in (401, 403)


@pytest.mark.anyio
async def test_live_input_returns_shape_and_order(client, db_session: AsyncSession) -> None:
    interview = await _seed_interview_with_questions(db_session)

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/live-input",
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    body = response.json()

    assert body["interview_id"] == str(interview.id)
    assert body["vacancy"] == {
        "title": "Backend Developer",
        "grade": "middle",
        "description": "Postgres, FastAPI",
        "required_skills": ["python"],
        "nice_to_have_skills": ["docker"],
    }
    assert body["candidate"] == {"name": "Ivan Petrov", "resume_text": ""}

    # Order must follow `order` (0, 1, 2), not creation order (2, 0, 1).
    assert [q["text"] for q in body["questions"]] == ["First", "Second", "Third"]

    first, second, third = body["questions"]
    assert first["intent"] == "intent-1"
    assert first["reference_answer"] == "ref-1"
    assert first["skill_tag"] == ["python"]
    assert first["difficulty"] == "baseline"
    assert first["rubric_notes"] == ""
    assert uuid.UUID(first["id"])

    # Question without intent/reference_answer/skill_tag coalesces to "" / [].
    assert second["intent"] == ""
    assert second["reference_answer"] == ""
    assert second["skill_tag"] == []

    # stt_terms passthrough: set on the third question, [] when the column is NULL.
    assert third["stt_terms"] == ["gRPC", "protobuf"]
    assert first["stt_terms"] == []


@pytest.mark.anyio
async def test_live_input_defaults_candidate_name_when_missing(client, db_session: AsyncSession) -> None:
    interview = await _seed_interview_with_questions(db_session)
    interview.candidate_name = None
    db_session.add(interview)
    await db_session.commit()

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/live-input",
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["candidate"]["name"] == ""
