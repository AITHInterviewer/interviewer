"""Гейты пилота 009: invite только с active, handoff, менеджер, эксперт."""

from __future__ import annotations

import pytest

from app.services.vacancy_llm_service import GeneratedQuestion, GeneratedQuestionSet, VacancyLLMService
from tests.conftest import create_internal_user, login, register_recruiter


def _patch_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """Комплект собирается из требований вакансии — по одному assessment-вопросу на
    требование, как того требует проверка покрытия в approve."""

    async def fake_generate_questions(self, vacancy) -> GeneratedQuestionSet:
        names = [item["name"] for item in (vacancy.requirements or [])] or list(vacancy.required_skills)
        return GeneratedQuestionSet(
            questions=[
                GeneratedQuestion(text="Разогрев", role="warmup", estimated_duration_sec=120),
                *[
                    GeneratedQuestion(
                        text=f"Вопрос про {name}",
                        role="assessment",
                        skill_tag=[name],
                        intent="intent",
                        reference_answer="reference",
                        estimated_duration_sec=180,
                    )
                    for name in names
                ],
                GeneratedQuestion(text="Заключение", role="closing", estimated_duration_sec=120),
            ]
        )

    monkeypatch.setattr(VacancyLLMService, "generate_questions", fake_generate_questions)


# Три требования — минимум, с которым вакансию пускают к эксперту
# (VacancyService.MIN_REQUIREMENTS).
_REQUIREMENTS = [
    {"id": "req_0", "name": "Python", "kind": "must", "level": "confident",
     "evidence": "Опыт работы с Python", "source": "llm"},
    {"id": "req_1", "name": "PostgreSQL", "kind": "must", "level": "expert",
     "evidence": "PostgreSQL — проектирование схем", "source": "llm"},
    {"id": "req_2", "name": "Docker", "kind": "must", "level": "basic",
     "evidence": "Docker — контейнеризация", "source": "llm"},
]


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
            "requirements": _REQUIREMENTS,
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
    # Вопросы здесь больше не собираются: эксперту уходят требования, комплект появляется
    # при approve (specs/010-vacancy-from-description).
    send = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/send-to-expert",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert send.status_code == 200
    assert send.json()["status"] == "calibration"


async def _activate(client, token: str, vacancy_id: str) -> None:
    # approve() переводит вакансию сразу в "active" — отдельный /activate после него
    # (из "approved") больше не нужен, см. VacancyService.approve_vacancy.
    await _calibrate(client, token, vacancy_id)
    approve = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/approve",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "active"


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
    # На калибровке (до подтверждения экспертом) вакансия ещё не активна — approve()
    # теперь переводит вакансию сразу в "active" (без промежуточного "approved"), так
    # что для проверки гейта берём состояние до approve.
    await _calibrate(client, token, vacancy["id"])

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


async def _ready_interview(client, monkeypatch: pytest.MonkeyPatch) -> tuple[str, dict, dict, dict]:
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
    return combo_token, manager, vacancy, interview


@pytest.mark.anyio
async def test_grant_opinion_sets_decision(client, monkeypatch: pytest.MonkeyPatch) -> None:
    combo_token, manager, vacancy, interview = await _ready_interview(client, monkeypatch)
    interview_id = interview["interview"]["id"]

    grant = await client.post(
        f"/api/v1/interviews/{interview_id}/opinion-grant",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"manager_id": manager["id"]},
    )
    assert grant.status_code == 200

    listed = await client.get(
        f"/api/v1/vacancies/{vacancy['id']}/interviews",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert listed.status_code == 200
    match = next(item for item in listed.json()["items"] if item["id"] == interview_id)
    assert match["recruiter_decision"] == "opinion_asked"


@pytest.mark.anyio
async def test_reject_sets_decision(client, monkeypatch: pytest.MonkeyPatch) -> None:
    combo_token, _manager, vacancy, interview = await _ready_interview(client, monkeypatch)
    interview_id = interview["interview"]["id"]

    rejected = await client.post(
        f"/api/v1/interviews/{interview_id}/reject",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["recruiter_decision"] == "rejected"

    listed = await client.get(
        f"/api/v1/vacancies/{vacancy['id']}/interviews",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert listed.status_code == 200
    match = next(item for item in listed.json()["items"] if item["id"] == interview_id)
    assert match["recruiter_decision"] == "rejected"


@pytest.mark.anyio
async def test_handoff_after_rejected_is_409(client, monkeypatch: pytest.MonkeyPatch) -> None:
    combo_token, manager, _vacancy, interview = await _ready_interview(client, monkeypatch)
    interview_id = interview["interview"]["id"]

    rejected = await client.post(
        f"/api/v1/interviews/{interview_id}/reject",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert rejected.status_code == 200

    handoff = await client.post(
        f"/api/v1/interviews/{interview_id}/handoff",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"to_manager_id": manager["id"], "summary": "Ready for review"},
    )
    assert handoff.status_code == 409


@pytest.mark.anyio
async def test_handoff_after_opinion_asked_is_200(client, monkeypatch: pytest.MonkeyPatch) -> None:
    combo_token, manager, vacancy, interview = await _ready_interview(client, monkeypatch)
    interview_id = interview["interview"]["id"]

    grant = await client.post(
        f"/api/v1/interviews/{interview_id}/opinion-grant",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"manager_id": manager["id"]},
    )
    assert grant.status_code == 200

    handoff = await client.post(
        f"/api/v1/interviews/{interview_id}/handoff",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"to_manager_id": manager["id"], "summary": "Ready for review"},
    )
    assert handoff.status_code == 200

    listed = await client.get(
        f"/api/v1/vacancies/{vacancy['id']}/interviews",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert listed.status_code == 200
    match = next(item for item in listed.json()["items"] if item["id"] == interview_id)
    assert match["recruiter_decision"] == "handed_off"
