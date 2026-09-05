"""Async SQLAlchemy engine/session (specs/003-recruiter-vacancy-management).

Первая версия DB-слоя backend'а — до этого файла не было ни engine, ни `Base`, ни
DB-сессии (см. `specs/004-candidate-interview-flow/tasks.md`, T004, комментарий про
блокировку на 003). Заведена минимально, чтобы [[004-candidate-interview-flow]] могло
получить реальные `Interview`/`Question`/`Answer` вместо `interview_directory.py`-
заглушки — CRUD/auth рекрутёра (остальной скоуп 003) сюда не входит.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


# Alias used by the internal auth/roles feature (specs/006-recruiter-auth), which
# depends on this name.
get_db_session = get_db
