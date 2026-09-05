import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from tests.conftest import seed_demo_interview


@pytest.mark.anyio
async def test_get_interview_consent_info_returns_seeded_entry(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token", question_count=6)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/api/interview/demo-token")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "created"
    assert body["questions_total"] == 6
    # 6 вопросов x 200с = 1200с база + 300с оверхед = 1500с = 25 мин нижняя граница;
    # верхняя = 1500 + 4 x 200с = 2300с = 38.33 -> 38 мин (см. interview_repository.py).
    assert body["estimated_duration_min"] == {"min": 25, "max": 38}


@pytest.mark.anyio
async def test_get_interview_consent_info_completed_status(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token-completed", status="completed")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/api/interview/demo-token-completed")

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


@pytest.mark.anyio
async def test_get_interview_consent_info_unknown_token_is_404(db_session: AsyncSession) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/api/interview/does-not-exist")

    assert response.status_code == 404


@pytest.mark.anyio
async def test_livekit_token_issued_for_active_interview(db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session, access_token="demo-token-livekit")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/api/interview/demo-token-livekit/livekit-token")

    assert response.status_code == 200
    body = response.json()
    assert body["room_name"] == str(interview.id)
    assert isinstance(body["token"], str) and body["token"]


@pytest.mark.anyio
async def test_livekit_token_rejects_completed_interview(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token-completed-2", status="completed")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/api/interview/demo-token-completed-2/livekit-token")

    assert response.status_code == 409
