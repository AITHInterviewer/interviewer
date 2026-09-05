"""Тестовая БД — файловый SQLite (aiosqlite), не реальный Postgres.

`DATABASE_URL` по умолчанию (asyncpg) указывает на Postgres, недоступный в тестовом
окружении, поэтому здесь — до импорта `app.db`/`app.main` — он подменяется на SQLite.
Модели используют `.with_variant(..., "sqlite")` именно для этого случая (см.
`app/models/vacancy.py`, `question.py`, `answer.py`) — на боевой Postgres-DSN это не
влияет, там применяется основной тип.

`reset_database` (autouse) пересоздаёт схему на общем `app.db.engine` перед каждым
тестом — и `db_session`, и запросы через ASGI-приложение (`client` или
`AsyncClient(transport=ASGITransport(app=app))` внутри теста) видят одни и те же
данные, поскольку все ходят в один и тот же engine/DB-файл.

`reset_database`/`cleanup_test_db` используют `asyncio.run(...)` вместо async-фикстур:
`tests/test_interview_ws.py` держит синхронные (не `@pytest.mark.anyio`) тест-функции
с собственным изолированным engine, и anyio-плагин pytest не умеет прогонять async
autouse-фикстуры для таких тестов — sync-обёртка работает одинаково для обоих стилей.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_auth.db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import InternalUser, Interview, Question, Vacancy  # регистрирует все модели в Base.metadata
from app.services.role_service import RoleService

# httpx's ASGITransport does not execute the FastAPI lifespan, so the registry
# is initialized here as well; the lifespan does the same at real startup.
app.state.role_service = RoleService()


@pytest.fixture(autouse=True)
def reset_role_service():
    app.state.role_service = RoleService()
    yield
    app.state.role_service = RoleService()


async def _create_schema() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)


async def _drop_schema() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
def reset_database() -> Iterator[None]:
    asyncio.run(_create_schema())
    yield
    asyncio.run(_drop_schema())


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as current_client:
        yield current_client


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_db() -> Iterator[None]:
    yield

    asyncio.run(engine.dispose())
    test_db = Path("test_auth.db")
    if test_db.exists():
        test_db.unlink()


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def seed_demo_interview(
    session: AsyncSession,
    *,
    access_token: str = "demo-token",
    status: str = "created",
    question_count: int = 6,
) -> Interview:
    """Минимальный набор строк (InternalUser → Vacancy → Question* → Interview) для тестов
    кандидатского флоу — замена удалённому `interview_directory.py`-мок-словарю."""
    recruiter = InternalUser(email=f"{uuid.uuid4()}@example.com", name="Test Recruiter", password_hash="x")
    session.add(recruiter)
    await session.flush()

    vacancy = Vacancy(
        recruiter_id=recruiter.id, title="Backend-разработчик", description="...", grade="middle"
    )
    session.add(vacancy)
    await session.flush()

    for i in range(question_count):
        session.add(
            Question(
                vacancy_id=vacancy.id,
                text=f"Question {i}",
                order=i,
                estimated_duration_sec=200,
                source="base_manual",
            )
        )

    interview = Interview(
        vacancy_id=vacancy.id,
        resume_file_url="s3://bucket/resume.pdf",
        access_token=access_token,
        status=status,
    )
    session.add(interview)
    await session.commit()
    return interview


async def register_recruiter(client: AsyncClient, email: str = "recruiter@example.com") -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": email, "password": "StrongPass123"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


async def create_internal_user(
    client: AsyncClient,
    token: str,
    *,
    email: str,
    roles: list[str],
    name: str = "Managed User",
    temporary_password: str = "TempPass123",
) -> dict:
    response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "email": email, "roles": roles, "temporary_password": temporary_password},
    )
    assert response.status_code == 201
    return response.json()


async def login(client: AsyncClient, email: str, password: str = "TempPass123") -> str:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]
