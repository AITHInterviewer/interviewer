import pytest

from tests.conftest import (
    add_vacancy_question,
    create_internal_user,
    create_vacancy,
    login,
    register_recruiter,
)


@pytest.mark.anyio
async def test_recruiter_can_create_and_list_own_vacancies(client) -> None:
    token = await register_recruiter(client)
    created = await create_vacancy(client, token, title="Platform Engineer")

    response = await client.get("/api/v1/vacancies", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["id"] == created["id"]
    assert payload["items"][0]["title"] == "Platform Engineer"


@pytest.mark.anyio
async def test_managing_recruiter_can_access_managed_users_vacancy(client) -> None:
    recruiter_token = await register_recruiter(client)
    managed = await create_internal_user(
        client,
        recruiter_token,
        email="managed.recruiter@example.com",
        roles=["recruiter"],
        name="Managed Recruiter",
    )
    managed_token = await login(client, managed["email"])
    vacancy = await create_vacancy(client, managed_token, title="Managed Vacancy")

    response = await client.get(
        f"/api/v1/vacancies/{vacancy['id']}", headers={"Authorization": f"Bearer {recruiter_token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Managed Vacancy"
    assert body["managing_recruiter_id"] == managed["created_by_user_id"]
    assert "vacancy.body.edit" in body["viewer_permissions"]


@pytest.mark.anyio
async def test_unrelated_recruiter_is_denied_vacancy_access(client) -> None:
    owner_token = await register_recruiter(client, email="owner@example.com")
    other_token = await register_recruiter(client, email="other@example.com")
    vacancy = await create_vacancy(client, owner_token)

    response = await client.get(
        f"/api/v1/vacancies/{vacancy['id']}", headers={"Authorization": f"Bearer {other_token}"}
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_recruiter_can_create_and_update_questions(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token)
    updated = await add_vacancy_question(
        client,
        token,
        vacancy["id"],
        vacancy["updated_at"],
        text="Tell me about a difficult migration.",
        reference_answer="Looks for ownership and tradeoffs.",
    )

    assert len(updated["questions"]) == 1
    question = updated["questions"][0]
    response = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}/questions/{question['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "expected_updated_at": updated["updated_at"],
            "text": "Walk through a difficult migration.",
            "skill_tags": ["PostgreSQL"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["questions"][0]["text"] == "Walk through a difficult migration."
    assert payload["questions"][0]["skill_tags"] == ["PostgreSQL"]


@pytest.mark.anyio
async def test_submit_for_review_is_permissive_for_incomplete_vacancy(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(
        client,
        token,
        required_skills=[],
        nice_to_have_skills=[],
        job_description=None,
        ideal_candidate_profile=None,
    )

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "submitted_for_review"
    assert payload["review_state"]["submitted_at"] is not None


@pytest.mark.anyio
async def test_invalid_submit_state_is_rejected(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token)
    archived = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/archive",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )
    assert archived.status_code == 200

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": archived.json()["updated_at"]},
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_changes_requested_returns_to_draft_on_recruiter_edit(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(
        client, recruiter_token, email="expert@example.com", roles=["expert"], name="Expert"
    )
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    with_question = await add_vacancy_question(
        client, recruiter_token, vacancy["id"], vacancy["updated_at"], text="Question?"
    )
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": with_question["updated_at"]},
    )
    requested = await client.post(
        f"/api/v1/expert/vacancies/{vacancy['id']}/request-changes",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": submitted.json()["updated_at"], "comment": ""},
    )

    response = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": requested.json()["updated_at"], "title": "Updated title"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "draft"


@pytest.mark.anyio
async def test_significant_change_resets_approved_vacancy_to_draft(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(
        client, recruiter_token, email="expert@example.com", roles=["expert"], name="Expert"
    )
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    with_question = await add_vacancy_question(
        client,
        recruiter_token,
        vacancy["id"],
        vacancy["updated_at"],
        text="Explain CAP theorem.",
        reference_answer="Tradeoffs matter.",
    )
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": with_question["updated_at"]},
    )
    approved = await client.post(
        f"/api/v1/expert/vacancies/{vacancy['id']}/approve",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": submitted.json()["updated_at"], "comment": "Looks good"},
    )

    response = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": approved.json()["updated_at"], "required_skills": ["Python", "FastAPI"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "draft"
    assert payload["review_state"]["approved_at"] is None


@pytest.mark.anyio
async def test_archive_and_restore_vacancy(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token)

    archived = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/archive",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    restored = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/restore",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": archived.json()["updated_at"]},
    )

    assert restored.status_code == 200
    assert restored.json()["status"] == "draft"


@pytest.mark.anyio
async def test_stale_write_conflict_returns_409(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token)

    first = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"], "title": "First"},
    )
    assert first.status_code == 200

    second = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"], "title": "Second"},
    )

    assert second.status_code == 409


@pytest.mark.anyio
async def test_recruiter_can_set_and_clear_interview_time_limit(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token)

    updated = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"], "interview_time_limit_minutes": 30},
    )
    assert updated.status_code == 200
    assert updated.json()["interview_time_limit_minutes"] == 30

    cleared = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "expected_updated_at": updated.json()["updated_at"],
            "interview_time_limit_minutes": None,
        },
    )
    assert cleared.status_code == 200
    assert cleared.json()["interview_time_limit_minutes"] is None


@pytest.mark.anyio
async def test_interview_time_limit_range_is_validated(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token)

    for invalid in (3, 500):
        response = await client.patch(
            f"/api/v1/vacancies/{vacancy['id']}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "expected_updated_at": vacancy["updated_at"],
                "interview_time_limit_minutes": invalid,
            },
        )
        assert response.status_code == 422

    created = await client.post(
        "/api/v1/vacancies",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "With limit", "interview_time_limit_minutes": 45},
    )
    assert created.status_code == 201
    assert created.json()["interview_time_limit_minutes"] == 45
