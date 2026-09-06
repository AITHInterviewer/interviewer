import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.routers import candidate_interview as candidate_interview_router
from tests.conftest import seed_demo_interview


@pytest.fixture(autouse=True)
def _fake_start_recording(monkeypatch: pytest.MonkeyPatch) -> None:
    """LiveKit Egress недоступен в тестах — реальный сетевой вызов не нужен, эндпоинт
    и так переживает EgressError (см. candidate_interview.py), но не должен бить по сети."""

    async def fake_start_recording(interview_id: str) -> str:
        return "fake-egress-id"

    monkeypatch.setattr(candidate_interview_router, "start_recording", fake_start_recording)


@pytest.mark.anyio
async def test_get_interview_consent_info_returns_seeded_entry(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token", question_count=6)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/api/interview/demo-token")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "created"
    assert body["questions_total"] == 6
    assert body["product_state"] == "invited"
    assert body["consented"] is False
    # 6 вопросов x 200с = 1200с база + 300с оверхед = 1500с = 25 мин нижняя граница;
    # верхняя = 1500 + 4 x 200с = 2300с = 38.33 -> 38 мин (см. interview_repository.py).
    assert body["estimated_duration_min"] == {"min": 25, "max": 38}
    assert body["current_question_text"] is None


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


@pytest.mark.anyio
async def test_consent_sets_product_state(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token-consent")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/api/interview/demo-token-consent/consent")
        after = await client.get("/api/interview/demo-token-consent")

    assert response.status_code == 200
    assert response.json()["product_state"] == "consented"
    assert response.json()["consented"] is True
    assert after.json()["consented"] is True
    assert after.json()["product_state"] == "consented"


@pytest.mark.anyio
async def test_consent_on_completed_is_409(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token-consent-done", status="completed")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/api/interview/demo-token-consent-done/consent")

    assert response.status_code == 409


@pytest.mark.anyio
async def test_progress_forward_and_unknown_state(db_session: AsyncSession) -> None:
    await seed_demo_interview(db_session, access_token="demo-token-progress")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        opened = await client.post(
            "/api/interview/demo-token-progress/progress", json={"product_state": "opened"}
        )
        await client.post("/api/interview/demo-token-progress/consent")
        checked = await client.post(
            "/api/interview/demo-token-progress/progress", json={"product_state": "device_checked"}
        )
        unknown = await client.post(
            "/api/interview/demo-token-progress/progress", json={"product_state": "not_a_state"}
        )
        backward = await client.post(
            "/api/interview/demo-token-progress/progress", json={"product_state": "opened"}
        )

    assert opened.status_code == 200
    assert opened.json()["product_state"] == "opened"
    assert checked.status_code == 200
    assert checked.json()["product_state"] == "device_checked"
    assert unknown.status_code == 422
    assert backward.status_code == 409
