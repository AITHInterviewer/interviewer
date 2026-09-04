import pytest


@pytest.mark.anyio
async def test_register_returns_recruiter_token(client) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["user"]["role"] == "recruiter"
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
    assert me_response.json()["role"] == "recruiter"


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
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )
    token = register_response.json()["access_token"]

    create_response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Manager One",
            "email": "manager@example.com",
            "role": "hiring_manager",
            "temporary_password": "TempPass123",
        },
    )

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@example.com", "password": "TempPass123"},
    )
    landing_token = login_response.json()["access_token"]
    landing_response = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {landing_token}"},
    )
    list_response = await client.get(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert create_response.status_code == 201
    assert create_response.json()["role"] == "hiring_manager"
    assert landing_response.status_code == 200
    assert landing_response.json()["role"] == "hiring_manager"
    assert list_response.status_code == 200
    assert [user["role"] for user in list_response.json()["items"]] == ["hiring_manager"]


@pytest.mark.anyio
async def test_recruiter_only_sees_users_created_by_that_recruiter(client) -> None:
    recruiter_one = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter1@example.com", "password": "StrongPass123"},
    )
    recruiter_two = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter Two", "email": "recruiter2@example.com", "password": "StrongPass123"},
    )

    token_one = recruiter_one.json()["access_token"]
    token_two = recruiter_two.json()["access_token"]

    await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token_one}"},
        json={
            "name": "Manager One",
            "email": "manager1@example.com",
            "role": "hiring_manager",
            "temporary_password": "TempPass123",
        },
    )
    await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token_two}"},
        json={
            "name": "Expert Two",
            "email": "expert2@example.com",
            "role": "expert",
            "temporary_password": "TempPass123",
        },
    )

    list_response = await client.get(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token_one}"},
    )

    assert list_response.status_code == 200
    assert [user["email"] for user in list_response.json()["items"]] == ["manager1@example.com"]


@pytest.mark.anyio
async def test_non_recruiter_cannot_create_internal_accounts(client) -> None:
    recruiter_response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Recruiter One", "email": "recruiter@example.com", "password": "StrongPass123"},
    )
    recruiter_token = recruiter_response.json()["access_token"]
    await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={
            "name": "Manager One",
            "email": "manager@example.com",
            "role": "hiring_manager",
            "temporary_password": "TempPass123",
        },
    )
    manager_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@example.com", "password": "TempPass123"},
    )
    manager_token = manager_login.json()["access_token"]

    response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "name": "Blocked",
            "email": "blocked@example.com",
            "role": "expert",
            "temporary_password": "TempPass123",
        },
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_missing_token_is_rejected(client) -> None:
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 401
