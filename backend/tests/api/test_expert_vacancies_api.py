import pytest

from tests.conftest import (
    add_vacancy_question,
    create_internal_user,
    create_vacancy,
    login,
    register_recruiter,
)


@pytest.mark.anyio
async def test_expert_queue_lists_submitted_vacancies_only(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )
    assert submitted.status_code == 200

    response = await client.get(
        "/api/v1/expert/vacancies", headers={"Authorization": f"Bearer {expert_token}"}
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["status"] == "submitted_for_review"


@pytest.mark.anyio
async def test_expert_can_edit_questions_but_not_body(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    with_question = await add_vacancy_question(
        client, recruiter_token, vacancy["id"], vacancy["updated_at"], text="What is idempotency?"
    )
    question_id = with_question["questions"][0]["id"]
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": with_question["updated_at"]},
    )

    question_response = await client.patch(
        f"/api/v1/expert/vacancies/{vacancy['id']}/questions/{question_id}",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={
            "expected_updated_at": submitted.json()["updated_at"],
            "reference_answer": "Consistent repeated result.",
        },
    )
    assert question_response.status_code == 200
    assert question_response.json()["questions"][0]["reference_answer"] == "Consistent repeated result."

    body_response = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": question_response.json()["updated_at"], "title": "Should fail"},
    )
    assert body_response.status_code == 403


@pytest.mark.anyio
async def test_expert_can_request_changes_with_empty_comment(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )

    response = await client.post(
        f"/api/v1/expert/vacancies/{vacancy['id']}/request-changes",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": submitted.json()["updated_at"], "comment": ""},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "changes_requested"
    assert response.json()["review_state"]["latest_review_comment"] == ""


@pytest.mark.anyio
async def test_expert_can_approve_submitted_vacancy(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )

    response = await client.post(
        f"/api/v1/expert/vacancies/{vacancy['id']}/approve",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": submitted.json()["updated_at"], "comment": "Approved"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert response.json()["review_state"]["approved_at"] is not None


@pytest.mark.anyio
async def test_expert_cannot_edit_archived_or_approved_vacancies(client) -> None:
    recruiter_token = await register_recruiter(client)
    expert = await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(client, recruiter_token)
    with_question = await add_vacancy_question(
        client, recruiter_token, vacancy["id"], vacancy["updated_at"], text="Why event sourcing?"
    )
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": with_question["updated_at"]},
    )
    approved = await client.post(
        f"/api/v1/expert/vacancies/{vacancy['id']}/approve",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": submitted.json()["updated_at"], "comment": "ok"},
    )
    archive = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/archive",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": approved.json()["updated_at"]},
    )
    assert archive.status_code == 200

    response = await client.get(
        f"/api/v1/expert/vacancies/{vacancy['id']}", headers={"Authorization": f"Bearer {expert_token}"}
    )

    assert response.status_code == 403
