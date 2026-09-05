import pytest

from tests.conftest import create_internal_user, login, register_recruiter


@pytest.mark.anyio
async def test_create_user_with_multiple_roles(client) -> None:
    token = await register_recruiter(client)

    user = await create_internal_user(
        client, token, email="combo@example.com", roles=["expert", "hiring_manager"]
    )

    assert sorted(user["roles"]) == ["expert", "hiring_manager"]


@pytest.mark.anyio
async def test_add_role_to_existing_account(client) -> None:
    token = await register_recruiter(client)
    user = await create_internal_user(client, token, email="expert@example.com", roles=["expert"])

    response = await client.patch(
        f"/api/v1/internal-users/{user['id']}/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"add_roles": ["hiring_manager"]},
    )

    assert response.status_code == 200
    assert sorted(response.json()["roles"]) == ["expert", "hiring_manager"]


@pytest.mark.anyio
async def test_duplicate_add_does_not_duplicate_assignment(client) -> None:
    token = await register_recruiter(client)
    user = await create_internal_user(client, token, email="expert@example.com", roles=["expert"])

    response = await client.patch(
        f"/api/v1/internal-users/{user['id']}/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"add_roles": ["expert"]},
    )

    assert response.status_code == 200
    assert response.json()["roles"] == ["expert"]


@pytest.mark.anyio
async def test_remove_role_keeps_remaining_roles(client) -> None:
    token = await register_recruiter(client)
    user = await create_internal_user(
        client, token, email="combo@example.com", roles=["recruiter", "expert"]
    )

    response = await client.patch(
        f"/api/v1/internal-users/{user['id']}/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"remove_roles": ["expert"]},
    )

    assert response.status_code == 200
    assert response.json()["roles"] == ["recruiter"]


@pytest.mark.anyio
async def test_remove_last_role_is_rejected(client) -> None:
    token = await register_recruiter(client)
    user = await create_internal_user(client, token, email="expert@example.com", roles=["expert"])

    response = await client.patch(
        f"/api/v1/internal-users/{user['id']}/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"remove_roles": ["expert"]},
    )

    assert response.status_code == 400


@pytest.mark.anyio
async def test_unknown_role_code_is_rejected(client) -> None:
    token = await register_recruiter(client)

    response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Mystery One",
            "email": "mystery@example.com",
            "roles": ["not_a_role"],
            "temporary_password": "TempPass123",
        },
    )

    assert response.status_code == 400


@pytest.mark.anyio
async def test_empty_role_list_is_rejected(client) -> None:
    token = await register_recruiter(client)

    response = await client.post(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Nobody",
            "email": "nobody@example.com",
            "roles": [],
            "temporary_password": "TempPass123",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_empty_role_update_is_rejected(client) -> None:
    token = await register_recruiter(client)
    user = await create_internal_user(client, token, email="expert@example.com", roles=["expert"])

    response = await client.patch(
        f"/api/v1/internal-users/{user['id']}/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"add_roles": [], "remove_roles": []},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_unknown_user_role_update_returns_404(client) -> None:
    token = await register_recruiter(client)

    response = await client.patch(
        "/api/v1/internal-users/00000000-0000-0000-0000-000000000000/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"add_roles": ["expert"]},
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_multi_role_user_signs_in_with_full_role_set(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(
        client, token, email="combo@example.com", roles=["recruiter", "expert"]
    )

    combo_token = await login(client, "combo@example.com")

    me_response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {combo_token}"})
    assert me_response.status_code == 200
    assert sorted(me_response.json()["roles"]) == ["expert", "recruiter"]
