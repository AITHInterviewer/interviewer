"""Тесты для `agent._load_interview_input`/`_room_name_is_interview_uuid` — раздел 3 задачи
"live-interview quality pass" (2026-09-05). Без реального HTTP: `httpx.AsyncClient`
подменяется мок-классом (respx/pytest-httpx не установлены в этом venv — см. pyproject.toml),
т.к. `MOCK_PATH` в agent.py резолвится на импорте модуля из `MOCK_INTERVIEW_PATH`/дефолтного
`mock_data/interview_example.json`, тест этого не трогает и просто читает тот же файл.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ainterviewer import agent as agent_module  # noqa: E402

REAL_UUID = "5b1f5b8a-6e8b-4b3a-9f2a-3e6b9a1c7d21"


def test_room_name_is_interview_uuid_true_for_real_uuid():
    assert agent_module._room_name_is_interview_uuid(REAL_UUID) is True


@pytest.mark.parametrize("room_name", [None, "", "demo-001", "console", "not-a-uuid"])
def test_room_name_is_interview_uuid_false_for_non_uuid(room_name):
    assert agent_module._room_name_is_interview_uuid(room_name) is False


@pytest.mark.asyncio
async def test_load_interview_input_uses_mock_for_non_uuid_room_and_sets_interview_id():
    interview = await agent_module._load_interview_input("demo-manual-room")
    assert interview.interview_id == "demo-manual-room"
    assert len(interview.questions) > 0


@pytest.mark.asyncio
async def test_load_interview_input_uses_mock_unchanged_when_no_room_name():
    interview = await agent_module._load_interview_input(None)
    # Без имени комнаты interview_id остаётся тем, что записано в мок-файле.
    assert interview.interview_id == json.loads(agent_module.MOCK_PATH.read_text(encoding="utf-8"))["interview_id"]


class _FakeAsyncClient:
    """Мок-двойник `httpx.AsyncClient` — фиксирует, что и с какими заголовками запросили,
    и возвращает подготовленный ответ."""

    last_url: str | None = None
    last_headers: dict | None = None
    response: httpx.Response | None = None
    raise_error: Exception | None = None

    def __init__(self, *args, **kwargs):  # noqa: ANN002, ANN003, ARG002
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):  # noqa: ANN002
        return False

    async def get(self, url, headers=None):  # noqa: ANN001
        type(self).last_url = url
        type(self).last_headers = headers
        if type(self).raise_error is not None:
            raise type(self).raise_error
        return type(self).response


@pytest.mark.asyncio
async def test_load_interview_input_fetches_from_backend_for_uuid_room(monkeypatch):
    payload = json.loads(agent_module.MOCK_PATH.read_text(encoding="utf-8"))
    payload["interview_id"] = REAL_UUID
    for q in payload["questions"]:
        q["id"] = REAL_UUID  # содержимое id не важно для теста маршрутизации

    _FakeAsyncClient.response = httpx.Response(200, json=payload, request=httpx.Request("GET", "http://x"))
    _FakeAsyncClient.raise_error = None
    monkeypatch.setattr(agent_module.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setenv("BACKEND_BASE_URL", "http://backend-test:8000")
    monkeypatch.setenv("LIVE_AGENT_TOKEN", "secret-token")

    interview = await agent_module._load_interview_input(REAL_UUID)

    assert interview.interview_id == REAL_UUID
    assert _FakeAsyncClient.last_url == f"http://backend-test:8000/api/v1/interviews/{REAL_UUID}/live-input"
    assert _FakeAsyncClient.last_headers == {"X-Live-Agent-Token": "secret-token"}


@pytest.mark.asyncio
async def test_load_interview_input_raises_loudly_on_backend_failure(monkeypatch):
    _FakeAsyncClient.raise_error = httpx.ConnectError("boom", request=httpx.Request("GET", "http://x"))
    monkeypatch.setattr(agent_module.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setenv("BACKEND_BASE_URL", "http://backend-test:8000")
    monkeypatch.setenv("LIVE_AGENT_TOKEN", "secret-token")

    with pytest.raises(httpx.ConnectError):
        await agent_module._load_interview_input(REAL_UUID)
