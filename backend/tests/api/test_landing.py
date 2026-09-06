import pytest

from tests.conftest import create_internal_user, login, register_recruiter


@pytest.mark.anyio
async def test_landing_for_recruiter_plus_expert_contains_both_areas(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(
        client, token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    combo_token = await login(client, "combo@example.com")

    response = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {combo_token}"},
    )

    assert response.status_code == 200
    landing = response.json()
    assert sorted(landing["roles"]) == ["expert", "recruiter"]
    area_ids = [area["id"] for area in landing["available_areas"]]
    assert "area.recruiter_workspace" in area_ids
    assert "area.expert_questions" in area_ids
    assert "action.questions.edit" in landing["available_actions"]
    assert landing["default_path"] == "/vacancies"
    assert landing["default_path"] in {area["path"] for area in landing["available_areas"]}


@pytest.mark.anyio
async def test_landing_for_single_role_user_is_role_scoped(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(client, token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    response = await client.get(
        "/api/v1/internal-users/me/landing",
        headers={"Authorization": f"Bearer {expert_token}"},
    )

    assert response.status_code == 200
    landing = response.json()
    assert landing["roles"] == ["expert"]
    assert [area["id"] for area in landing["available_areas"]] == ["area.expert_questions"]
    assert landing["default_path"] == "/expert"
    assert "action.questions.edit" in landing["available_actions"]
