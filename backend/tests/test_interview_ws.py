"""T007/T031 — WS-хендшейк и relay `interview_ws.py` целиком (handshake, коды закрытия,
Redis → `ControlEvent` → WS-сообщение, закрытие на `completed`). Тестируется через
`TestClient` (свой event loop, через `client.portal` для async-сетапа) — не через
`db_session`/anyio-фикстуру (`tests/conftest.py`), т.к. `interview_ws.py` открывает
сессию сам через `SessionLocal`, а не через `Depends(get_db)` (тот DI-путь не
используется до `websocket.accept()`) — здесь подменяем `SessionLocal` напрямую через
`monkeypatch`. Redis — `fakeredis`, не настоящий сервер (недоступен в песочнице, где
писался код; на боевой `REDIS_URL` не влияет, см. `pyproject.toml`) — реальный Redis
может теоретически вести себя иначе на грани таймингов pub/sub, но протокол сообщений и
сама асинхронная оркестрация (`asyncio.create_task` + relay) здесь пройдены по-настоящему,
не замоканы.
"""

from __future__ import annotations

import json

import fakeredis.aioredis as fakeredis
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.db import Base
from app.main import app
from app.services.control_channel import redis_channel_name
from tests.conftest import seed_demo_interview


class _FixedRedisFactory:
    """Заглушка вместо класса `redis.asyncio.Redis` — `interview_ws.py` вызывает
    `Redis.from_url(...)`, здесь этот вызов всегда возвращает один и тот же `fakeredis`,
    общий с тем, что использует тест для публикации (иначе publisher/subscriber окажутся
    на разных фейковых серверах и не увидят сообщения друг друга)."""

    def __init__(self, instance: fakeredis.FakeRedis):
        self._instance = instance

    def from_url(self, *_args: object, **_kwargs: object) -> fakeredis.FakeRedis:
        return self._instance


@pytest.fixture
def ws_client(monkeypatch: pytest.MonkeyPatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr("app.routers.interview_ws.SessionLocal", session_factory)

    fake_redis = fakeredis.FakeRedis()
    monkeypatch.setattr("app.routers.interview_ws.Redis", _FixedRedisFactory(fake_redis))

    async def create_tables() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    with TestClient(app) as client:
        client.portal.call(create_tables)
        client.session_factory = session_factory  # type: ignore[attr-defined]
        client.fake_redis = fake_redis  # type: ignore[attr-defined]
        yield client


def test_invalid_token_closes_with_4401(ws_client: TestClient) -> None:
    with pytest.raises(Exception) as exc_info:  # noqa: PT011 — код закрытия проверяем ниже
        with ws_client.websocket_connect("/ws/interview/does-not-exist"):
            pass
    assert getattr(exc_info.value, "code", None) == 4401


def test_completed_interview_closes_with_4409(ws_client: TestClient) -> None:
    session_factory = ws_client.session_factory  # type: ignore[attr-defined]

    async def seed() -> None:
        async with session_factory() as session:
            await seed_demo_interview(session, access_token="ws-completed", status="completed")

    ws_client.portal.call(seed)

    with pytest.raises(Exception) as exc_info:  # noqa: PT011
        with ws_client.websocket_connect("/ws/interview/ws-completed"):
            pass
    assert getattr(exc_info.value, "code", None) == 4409


def test_relays_redis_event_as_control_event_and_closes_on_completed(ws_client: TestClient) -> None:
    session_factory = ws_client.session_factory  # type: ignore[attr-defined]
    fake_redis = ws_client.fake_redis  # type: ignore[attr-defined]

    async def seed() -> str:
        async with session_factory() as session:
            interview = await seed_demo_interview(session, access_token="ws-active", question_count=1)
            return str(interview.id)

    interview_id = ws_client.portal.call(seed)
    channel = redis_channel_name(interview_id)

    with ws_client.websocket_connect("/ws/interview/ws-active") as websocket:
        ws_client.portal.call(
            fake_redis.publish,
            channel,
            json.dumps({"type": "question_started", "question_id": "q1", "payload": {"text": "Вопрос 1"}}),
        )
        first = websocket.receive_json()
        assert first["type"] == "question"
        assert first["text"] == "Вопрос 1"
        # q1 (мок) не резолвится в Postgres Question — консервативный fallback (см. control_channel.py)
        assert first["input_format"] == "none"

        ws_client.portal.call(
            fake_redis.publish, channel, json.dumps({"type": "interview_completed", "payload": {}})
        )
        second = websocket.receive_json()
        assert second["type"] == "completed"

        with pytest.raises(Exception) as exc_info:  # noqa: PT011 — соединение должно закрыться сразу после completed
            websocket.receive_json()
        assert getattr(exc_info.value, "code", None) == 1000
