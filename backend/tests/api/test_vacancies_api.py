"""Capability-гейтинг и happy-path для `app/routers/vacancies.py` +
`app/routers/interviews_admin.py` (план, «Backend: new routers»).

LLM и S3 не вызываются по-настоящему — `VacancyLLMService.generate_questions` и
`storage._put_object_sync` подменяются через monkeypatch.
"""

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


@pytest.mark.anyio
async def test_non_recruiter_cannot_create_vacancy(client) -> None:
    recruiter_token = await register_recruiter(client)
    await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    response = await client.post(
        "/api/v1/vacancies",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"title": "x", "description": "x", "grade": "middle"},
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_either_role_can_read_vacancies(client) -> None:
    recruiter_token = await register_recruiter(client)
    await _create_vacancy(client, recruiter_token)
    await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    recruiter_list = await client.get(
        "/api/v1/vacancies", headers={"Authorization": f"Bearer {recruiter_token}"}
    )
    expert_list = await client.get("/api/v1/vacancies", headers={"Authorization": f"Bearer {expert_token}"})

    assert recruiter_list.status_code == 200
    assert expert_list.status_code == 200
    assert len(recruiter_list.json()["items"]) == 1
    assert len(expert_list.json()["items"]) == 1


@pytest.mark.anyio
async def test_expert_cannot_generate_questions(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_llm(monkeypatch)
    recruiter_token = await register_recruiter(client)
    vacancy = await _create_vacancy(client, recruiter_token)
    await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/questions/generate",
        headers={"Authorization": f"Bearer {expert_token}"},
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_full_vacancy_to_interview_flow(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_llm(monkeypatch)
    _patch_storage(monkeypatch)

    recruiter_token = await register_recruiter(client)
    await create_internal_user(
        client, recruiter_token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    combo_token = await login(client, "combo@example.com")

    vacancy = await _create_vacancy(client, combo_token)
    vacancy_id = vacancy["id"]
    # Вакансия создаётся сразу с требованиями — значит описание уже разобрано.
    assert vacancy["status"] == "extracted"
    assert [item["name"] for item in vacancy["requirements"]] == ["Python", "PostgreSQL", "Docker"]
    assert vacancy["required_skills"] == ["Python", "PostgreSQL", "Docker"]

    send_response = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/send-to-expert",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert send_response.status_code == 200
    assert send_response.json()["status"] == "calibration"

    # approve() переводит вакансию сразу в "active" (без промежуточного "approved" и
    # ручного /activate) — см. VacancyService.approve_vacancy.
    approve_response = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/approve",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "active"
    # Комплект собрался при одобрении: по вопросу на каждое требование + разогрев/закрытие.
    approved_questions = approve_response.json()["questions"]
    assert len(approved_questions) == 5
    assert sorted(
        tag for q in approved_questions if q["role"] == "assessment" for tag in q["skill_tag"]
    ) == ["Docker", "PostgreSQL", "Python"]

    locked_response = await client.patch(
        f"/api/v1/vacancies/{vacancy_id}",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"title": "New title"},
    )
    assert locked_response.status_code == 409

    interview_response = await client.post(
        f"/api/v1/vacancies/{vacancy_id}/interviews",
        headers={"Authorization": f"Bearer {combo_token}"},
        files={"resume_file": ("resume.pdf", b"%PDF-1.4 ...", "application/pdf")},
        data={"candidate_name": "Ivan Petrov"},
    )
    assert interview_response.status_code == 201
    interview_payload = interview_response.json()
    interview_id = interview_payload["interview"]["id"]
    access_token = interview_payload["interview"]["access_token"]
    assert interview_payload["candidate_link"].endswith(f"/i/{access_token}")

    list_interviews_response = await client.get(
        f"/api/v1/vacancies/{vacancy_id}/interviews",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert list_interviews_response.status_code == 200
    assert len(list_interviews_response.json()["items"]) == 1

    events_response = await client.get(
        f"/api/v1/interviews/{interview_id}/events",
        headers={"Authorization": f"Bearer {combo_token}"},
    )
    assert events_response.status_code == 200
    assert events_response.json()["events"] == []
    assert events_response.json()["answers"] == []


@pytest.mark.anyio
async def test_create_interview_rejects_non_ready_vacancy(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_storage(monkeypatch)
    recruiter_token = await register_recruiter(client)
    vacancy = await _create_vacancy(client, recruiter_token)

    response = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/interviews",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        files={"resume_file": ("resume.pdf", b"...", "application/pdf")},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_interview_events_endpoint_requires_recruiter(client) -> None:
    recruiter_token = await register_recruiter(client)
    await create_internal_user(client, recruiter_token, email="expert@example.com", roles=["expert"])
    expert_token = await login(client, "expert@example.com")

    response = await client.get(
        "/api/v1/interviews/00000000-0000-0000-0000-000000000000/events",
        headers={"Authorization": f"Bearer {expert_token}"},
    )

    assert response.status_code == 404
