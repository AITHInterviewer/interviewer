"""Гейты пилота 009: invite только с active, handoff, менеджер, эксперт."""

from __future__ import annotations

import pytest

from app.services.vacancy_llm_service import GeneratedQuestion, GeneratedQuestionSet, VacancyLLMService
from tests.conftest import create_internal_user, login, register_recruiter


def _patch_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_generate_questions(self, vacancy) -> GeneratedQuestionSet:
        return GeneratedQuestionSet(
            questions=[
                GeneratedQuestion(text="Разогрев", role="warmup", estimated_duration_sec=120),
                GeneratedQuestion(
                    text="Про индексы",
                    role="assessment",
                    skill_tag=["postgres"],
                    intent="intent",
                    reference_answer="reference",
                    estimated_duration_sec=180,
                ),
                GeneratedQuestion(text="Заключение", role="closing", estimated_duration_sec=120),
            ]
        )

    monkeypatch.setattr(VacancyLLMService, "generate_questions", fake_generate_questions)


def _patch_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.storage._put_object_sync", lambda key, content, content_type: None
    )


async def _create_vacancy(client, token: str) -> dict:
    response = await client.post(
        "/api/v1/vacancies",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Backend Developer",
            "description": "...",
            "grade": "middle",
            "required_skills": ["python"],
        },
    )
    assert response.status_code == 201
    return response.json()


async def _combo_token(client) -> str:
    recruiter_token = await register_recruiter(client)
    await create_internal_user(
        client, recruiter_token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    return await login(client, "combo@example.com")


async def _calibrate(client, token: str, vacancy_id: str) -> None:
    generate = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert generate.status_code == 200
    send = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/send-to-expert",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert send.status_code == 200
    assert send.json()["status"] == "calibration"


async def _activate(client, token: str, vacancy_id: str) -> None:
    await _calibrate(client, token, vacancy_id)
    approve = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/approve",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert approve.status_code == 200
    activate = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/activate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert activate.status_code == 200


async def _create_interview(client, token: str, vacancy_id: str) -> dict:
    response = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/interviews",
        headers={"Authorization": f"Bearer {token}"},
        files={"resume_file": ("resume.pdf", b"%PDF-1.4 ...", "application/pdf")},
        data={"candidate_name": "Ivan Petrov"},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.anyio
async def test_invite_before_active_is_422(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_llm(monkeypatch)
    _patch_storage(monkeypatch)
    token = await _combo_token(client)
    vacancy = await _create_vacancy(client, token)
    await _calibrate(client, token, vacancy["id"])
    approve = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/approve",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/interviews",
        headers={"Authorization": f"Bearer {token}"},
        files={"resume_file": ("resume.pdf", b"...", "application/pdf")},
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_handoff_with_open_extra_is_409(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_llm(monkeypatch)
    _patch_storage(monkeypatch)
    recruiter_token = await register_recruiter(client)
    await create_internal_user(
        client, recruiter_token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    combo_token = await login(client, "combo@example.com")
    manager = await create_internal_user(
        client, recruiter_token, email="manager@example.com", roles=["hiring_manager"]
    )

    vacancy = await _create_vacancy(client, combo_token)
    await _activate(client, combo_token, vacancy["id"])
    interview = await _create_interview(client, combo_token, vacancy["id"])
    interview_id = interview["interview"]["id"]

    extra = await client.post(
        f"/api/v1/interviews/{interview_id}/extra",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert extra.status_code == 200
    assert extra.json()["status"] == "requested"
    assert extra.json()["extra_token"]

    handoff = await client.post(
        f"/api/v1/interviews/{interview_id}/handoff",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"to_manager_id": manager["id"], "summary": "Ready for review"},
    )
    assert handoff.status_code == 409


@pytest.mark.anyio
async def test_manager_cannot_get_candidate_without_handoff(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_llm(monkeypatch)
    _patch_storage(monkeypatch)
    recruiter_token = await register_recruiter(client)
    await create_internal_user(
        client, recruiter_token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    combo_token = await login(client, "combo@example.com")
    await create_internal_user(
        client, recruiter_token, email="manager@example.com", roles=["hiring_manager"]
    )
    manager_token = await login(client, "manager@example.com")

    vacancy = await _create_vacancy(client, combo_token)
    await _activate(client, combo_token, vacancy["id"])
    interview = await _create_interview(client, combo_token, vacancy["id"])
    interview_id = interview["interview"]["id"]

    response = await client.get(
        f"/api/v1/manager/candidates/{interview_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_expert_cannot_post_interviews(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_storage(monkeypatch)
    recruiter_token = await register_recruiter(client)
    vacancy = await _create_vacancy(client, recruiter_token)
    await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/interviews",
        headers={"Authorization": f"Bearer {expert_token}"},
        files={"resume_file": ("resume.pdf", b"...", "application/pdf")},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_request_changes_from_calibration(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_llm(monkeypatch)
    token = await _combo_token(client)
    vacancy = await _create_vacancy(client, token)
    await _calibrate(client, token, vacancy["id"])

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/request-changes",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "Need a stronger system-design question"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "changes_requested"
    assert response.json()["owner_next"] == "recruiter"
