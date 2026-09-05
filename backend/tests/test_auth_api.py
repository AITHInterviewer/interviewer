import pytest

from tests.conftest import create_internal_user, register_recruiter


@pytest.mark.anyio
async def test_register_returns_recruiter_token(client) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["user"]["roles"] == ["recruiter"]
    assert payload["access_token"]


@pytest.mark.anyio
async def test_register_rejects_duplicate_email(client) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter Two", "email": "recruiter@example.com", "password": "StrongPass123"},
    )

    assert response.status_code == 409


@pytest.mark.anyio
async def test_login_and_get_me(client) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "recruiter@example.com", "password": "StrongPass123"},
    )

    token = login_response.json()["access_token"]
    me_response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert login_response.status_code == 200
    assert me_response.status_code == 200
    assert me_response.json()["roles"] == ["recruiter"]


@pytest.mark.anyio
async def test_login_rejects_invalid_credentials(client) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "recruiter@example.com", "password": "WrongPass123"},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_recruiter_creates_internal_accounts_and_landing(client) -> None:
    token = await register_recruiter(client)

    create_response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Manager One",
            "email": "manager@example.com",
            "roles": ["hiring_manager"],
            "temporary_password": "TempPass123",
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["roles"] == ["hiring_manager"]

    list_response = await client.get(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert [item["email"] for item in items] == ["manager@example.com"]
    assert items[0]["roles"] == ["hiring_manager"]

    landing_response = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert landing_response.status_code == 200
    landing = landing_response.json()
    assert landing["roles"] == ["recruiter"]
    assert landing["default_path"] == "/vacancies"
    assert [area["id"] for area in landing["available_areas"]] == ["area.recruiter_workspace"]
    assert "action.internal_users.manage" in landing["available_actions"]


@pytest.mark.anyio
async def test_non_manager_cannot_create_internal_users(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(client, token, email="expert@example.com", roles=["expert"])
    expert_token = (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "expert@example.com", "password": "TempPass123"},
        )
    ).json()["access_token"]

    response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={
            "name": "Manager One",
            "email": "manager@example.com",
            "roles": ["hiring_manager"],
            "temporary_password": "TempPass123",
        },
    )

    assert response.status_code == 403
