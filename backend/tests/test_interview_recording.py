import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers import interviews_admin
from tests.conftest import create_internal_user, login, register_recruiter, seed_demo_interview


class _RecordingBody:
    def __init__(self, content: bytes) -> None:
        self.content = content
        self.closed = False

    def read(self, _: int) -> bytes:
        content, self.content = self.content, b""
        return content

    def close(self) -> None:
        self.closed = True


@pytest.mark.anyio
async def test_recruiter_can_stream_private_recording(
    client,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    interview = await seed_demo_interview(db_session)
    interview.recording_url = "private-recording-marker"
    await db_session.commit()
    token = await register_recruiter(client)
    body = _RecordingBody(b"mp4-bytes")

    async def fake_get_recording(interview_id: str):
        assert interview_id == str(interview.id)
        return {"Body": body, "ContentType": "video/mp4"}

    monkeypatch.setattr(interviews_admin, "get_recording", fake_get_recording)

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/recording",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.content == b"mp4-bytes"
    assert response.headers["content-type"] == "video/mp4"
    assert response.headers["cache-control"] == "private, no-store"
    assert body.closed is True


@pytest.mark.anyio
async def test_recording_stream_requires_recruiter_authentication(client, db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session)
    interview.recording_url = "private-recording-marker"
    await db_session.commit()

    response = await client.get(f"/api/v1/interviews/{interview.id}/recording")

    assert response.status_code == 401


@pytest.mark.anyio
async def test_expert_cannot_stream_interview_recording(client, db_session: AsyncSession) -> None:
    interview = await seed_demo_interview(db_session)
    interview.recording_url = "private-recording-marker"
    await db_session.commit()
    recruiter_token = await register_recruiter(client)
    await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/recording",
        headers={"Authorization": f"Bearer {expert_token}"},
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_hiring_manager_can_stream_recording_for_assigned_candidate(
    client,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    interview = await seed_demo_interview(db_session)
    interview.recording_url = "private-recording-marker"
    await db_session.commit()
    recruiter_token = await register_recruiter(client)
    await create_internal_user(client, recruiter_token, email="manager@example.com", roles=["hiring_manager"])
    manager_token = await login(client, "manager@example.com")
    body = _RecordingBody(b"manager-mp4-bytes")

    class FakePilotService:
        def __init__(self, _) -> None:
            pass

        async def manager_can_view(self, interview_id, manager_id) -> bool:
            return interview_id == interview.id and manager_id is not None

    async def fake_get_recording(_: str):
        return {"Body": body, "ContentType": "video/mp4"}

    monkeypatch.setattr(interviews_admin, "PilotService", FakePilotService)
    monkeypatch.setattr(interviews_admin, "get_recording", fake_get_recording)

    response = await client.get(
        f"/api/v1/interviews/{interview.id}/recording",
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 200
    assert response.content == b"manager-mp4-bytes"
