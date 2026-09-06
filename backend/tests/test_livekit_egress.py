"""`livekit_egress`: чистые хелперы (ключ/URL) + сворачивание ошибок в `EgressError`.

Реальный LiveKit/S3 не поднимаем — `_client()`/`_ensure_recordings_bucket_sync` подменены,
проверяем только контракт (какая ошибка наружу, что за id возвращается).
"""

from __future__ import annotations

import pytest

from app.services import livekit_egress


def test_recording_key_and_public_url_use_interview_id() -> None:
    assert livekit_egress.recording_key("abc") == "recordings/abc.mp4"
    url = livekit_egress.recording_public_url("abc")
    assert url.endswith("/ainterviewer-recordings/recordings/abc.mp4") or "recordings/abc.mp4" in url


@pytest.mark.anyio
async def test_start_recording_wraps_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(livekit_egress, "_ensure_recordings_bucket_sync", lambda: None)

    class _FailingEgress:
        async def start_room_composite_egress(self, request):  # noqa: ANN001
            raise RuntimeError("boom")

    class _FakeClient:
        egress = _FailingEgress()

        async def aclose(self) -> None:
            pass

    monkeypatch.setattr(livekit_egress, "_client", lambda: _FakeClient())

    with pytest.raises(livekit_egress.EgressError):
        await livekit_egress.start_recording("interview-1")


@pytest.mark.anyio
async def test_start_recording_returns_egress_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(livekit_egress, "_ensure_recordings_bucket_sync", lambda: None)

    class _FakeInfo:
        egress_id = "egress-123"

    class _FakeEgress:
        async def start_room_composite_egress(self, request):  # noqa: ANN001
            return _FakeInfo()

    class _FakeClient:
        egress = _FakeEgress()

        async def aclose(self) -> None:
            pass

    monkeypatch.setattr(livekit_egress, "_client", lambda: _FakeClient())

    egress_id = await livekit_egress.start_recording("interview-1")
    assert egress_id == "egress-123"


@pytest.mark.anyio
async def test_stop_recording_wraps_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FailingEgress:
        async def stop_egress(self, request):  # noqa: ANN001
            raise RuntimeError("boom")

    class _FakeClient:
        egress = _FailingEgress()

        async def aclose(self) -> None:
            pass

    monkeypatch.setattr(livekit_egress, "_client", lambda: _FakeClient())

    with pytest.raises(livekit_egress.EgressError):
        await livekit_egress.stop_recording("egress-123")
