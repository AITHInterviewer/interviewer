import pytest

from tests.conftest import create_internal_user, login, register_recruiter


@pytest.mark.anyio
async def test_single_role_sign_in_and_landing_unchanged(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(client, token, email="manager@example.com", roles=["hiring_manager"])
    manager_token = await login(client, "manager@example.com")

    landing = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    questions = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"text": "Denied for non-expert."},
    )

    assert landing.status_code == 200
    assert landing.json()["roles"] == ["hiring_manager"]
    assert landing.json()["default_path"] == "/internal/hiring-manager"
    assert questions.status_code == 403


@pytest.mark.anyio
async def test_recruiter_plus_expert_regression(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(
        client, token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    combo_token = await login(client, "combo@example.com")

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {combo_token}"})
    landing = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    manage = await client.get(
        "/api/v1/internal-users",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    questions = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"text": "Allowed for expert-capable user."},
    )

    assert me.status_code == 200
    assert sorted(me.json()["roles"]) == ["expert", "recruiter"]
    assert landing.status_code == 200
    assert manage.status_code == 200
    assert questions.status_code == 201


@pytest.mark.anyio
async def test_recruiter_landing_keeps_management_access(client) -> None:
    token = await register_recruiter(client)

    landing = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert landing.status_code == 200
    assert landing.json()["default_path"] == "/internal/recruiter"
    assert "action.internal_users.manage" in landing.json()["available_actions"]
