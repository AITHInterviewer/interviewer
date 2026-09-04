import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_auth.db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from app.db import Base, SessionLocal, engine
from app.main import app


@pytest.fixture(autouse=True)
async def reset_database() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as current_client:
        yield current_client


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_db() -> None:
    yield

    test_db = Path("test_auth.db")
    if test_db.exists():
        test_db.unlink()


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session
