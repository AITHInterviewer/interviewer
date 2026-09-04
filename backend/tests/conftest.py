"""Тестовая БД — SQLite в памяти (aiosqlite), не реальный Postgres.

Причина: `DATABASE_URL` (asyncpg) указывает на Postgres, которого нет в песочнице, где
писался код (нет Docker/сети до реальной БД). Модели используют `.with_variant(...,
"sqlite")` именно для этого случая (см. `app/models/vacancy.py`, `question.py`,
`answer.py`) — на боевой Postgres-DSN это не влияет, там применяется основной тип.

`override_get_db` подменяет `app.db.get_db` на сессию к этому SQLite-движку — тесты не
трогают `DATABASE_URL`/боевой engine из `app/db.py` вообще.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Interview, Question, Recruiter, Vacancy  # регистрирует все модели в Base.metadata


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    # StaticPool — один и тот же физический in-memory SQLite для всех подключений этого
    # engine; без него каждый checkout соединения открывал бы отдельную пустую `:memory:`
    # базу (и override_get_db ниже не видел бы данных, засеянных через `db_session`).
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with session_factory() as session:
            yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def seed_demo_interview(
    session: AsyncSession,
    *,
    access_token: str = "demo-token",
    status: str = "created",
    question_count: int = 6,
) -> Interview:
    """Минимальный набор строк (Recruiter → Vacancy → Question* → Interview) для тестов
    кандидатского флоу — замена удалённому `interview_directory.py`-мок-словарю."""
    recruiter = Recruiter(email=f"{uuid.uuid4()}@example.com", name="Test Recruiter", password_hash="x")
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
