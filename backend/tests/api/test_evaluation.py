"""Тесты сервисных эндпоинтов для evaluation-agent (specs/005-batch-evaluation-contour)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Answer, Question
from tests.conftest import seed_demo_interview

SERVICE_TOKEN = "dev-evaluation-token"


@pytest.mark.anyio
async def test_evaluation_input_requires_service_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session)
    response = await client.get(f"/api/v1/interviews/{interview.id}/evaluation-input")
    assert response.status_code == 403


@pytest.mark.anyio
async def test_evaluation_input_returns_assessment_questions_and_answers(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session, question_count=2)
    questions = (
        await db_session.execute(select(Question).where(Question.vacancy_id == interview.vacancy_id))
    ).scalars().all()

    db_session.add(
        Answer(
            interview_id=interview.id,
            question_id=questions[0].id,
            role="assessment",
            transcript_text="candidate answer text",
            started_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/evaluation-input",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["interview"]["id"] == str(interview.id)
    assert data["vacancy"]["title"] == "Backend-разработчик"
    assert len(data["questions"]) == 2
    assert data["questions"][0]["answer"]["transcript_text"] == "candidate answer text"
    assert data["questions"][1]["answer"] is None


@pytest.mark.anyio
async def test_create_evaluation_persists_result_and_completes_interview(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session, status="in_progress")
    payload = {
        "per_question": [
            {
                "question_id": str(uuid4()),
                "skill_scores": [
                    {"skill_tag": "Python", "score": 80, "rationale": "good"}
                ],
                "quotes": [],
                "confidence": 0.9,
                "answered_with_hint": False,
                "report": "Ответ покрывает основные пункты эталона.",
            }
        ],
        "overall_score": 80,
        "verdict": "fits",
        "confirmed_skills": ["Python"],
        "unconfirmed_skills": [],
        "contradictions_found": [],
        "strengths": ["Python confirmed"],
        "risks": [],
        "summary_intro": "intro",
        "summary_conclusion": "conclusion",
        "model_version": "claude-test",
        "prompt_version": "v1",
        "generated_at": datetime.now(UTC).isoformat(),
    }

    response = await client.post(
        f"/api/v1/interviews/{interview.id}/evaluation",
        headers={"X-Service-Token": SERVICE_TOKEN},
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["verdict"] == "fits"
    assert data["overall_score"] == 80
    assert data["per_question"][0]["report"] == "Ответ покрывает основные пункты эталона."

    await db_session.refresh(interview)
    assert interview.status == "in_progress"


@pytest.mark.anyio
async def test_create_evaluation_rejects_invalid_service_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session)
    response = await client.post(
        f"/api/v1/interviews/{interview.id}/evaluation",
        json={"verdict": "fits"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_get_evaluation_returns_saved_report(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    interview = await seed_demo_interview(db_session)
    payload = {
        "per_question": [
            {
                "question_id": str(uuid4()),
                "skill_scores": [
                    {"skill_tag": "Python", "score": 80, "rationale": "good"}
                ],
                "quotes": [],
                "confidence": 0.9,
                "answered_with_hint": False,
                "report": "Per-question report text.",
            }
        ],
        "overall_score": 80,
        "verdict": "fits",
        "confirmed_skills": ["Python"],
        "unconfirmed_skills": [],
        "contradictions_found": [],
        "strengths": [],
        "risks": [],
        "summary_intro": "intro",
        "summary_conclusion": "conclusion",
        "model_version": "claude-test",
        "prompt_version": "v1",
        "generated_at": datetime.now(UTC).isoformat(),
    }
    post_response = await client.post(
        f"/api/v1/interviews/{interview.id}/evaluation",
        headers={"X-Service-Token": SERVICE_TOKEN},
        json=payload,
    )
    assert post_response.status_code == 200

    get_response = await client.get(
        f"/api/v1/interviews/{interview.id}/evaluation",
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["per_question"][0]["report"] == "Per-question report text."
    assert data["verdict"] == "fits"
