import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.anyio
async def test_get_interview_consent_info_returns_seeded_entry() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/interview/demo-token")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "created"
    assert body["questions_total"] == 6
    assert body["estimated_duration_min"] == {"min": 25, "max": 40}


@pytest.mark.anyio
async def test_get_interview_consent_info_completed_status() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/interview/demo-token-completed")

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


@pytest.mark.anyio
async def test_get_interview_consent_info_unknown_token_is_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/interview/does-not-exist")

    assert response.status_code == 404
