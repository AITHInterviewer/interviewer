import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_auth.db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from app.db import Base, SessionLocal, engine
from app.main import app
from app.services.role_service import RoleService

# httpx's ASGITransport does not execute the FastAPI lifespan, so the registry
# is initialized here as well; the lifespan does the same at real startup.
app.state.role_service = RoleService()


@pytest.fixture(autouse=True)
def reset_role_service():
    app.state.role_service = RoleService()
    yield
    app.state.role_service = RoleService()


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
