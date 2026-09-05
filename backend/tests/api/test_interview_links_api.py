from datetime import UTC, datetime, timedelta

import pytest

from tests.conftest import create_internal_user, create_vacancy, login, register_recruiter

LINKS_URL = "/api/v1/vacancies/{vacancy_id}/links"
FUTURE = lambda: (datetime.now(UTC) + timedelta(days=7)).isoformat()  # noqa: E731


async def setup_approved_vacancy(
    client, *, with_limit: bool = True, owner_email: str = "recruiter@example.com"
) -> tuple[str, str, dict]:
    """Returns (recruiter_token, expert_token, approved_vacancy)."""
    recruiter_token = await register_recruiter(client, email=owner_email)
    expert = await create_internal_user(
        client, recruiter_token, email=f"expert-{owner_email}", roles=["expert"], name="Expert"
    )
    expert_token = await login(client, expert["email"])
    vacancy = await create_vacancy(
        client, recruiter_token, interview_time_limit_minutes=45 if with_limit else None
    )
    submitted = await client.post(
        f"/api/v1/vacancies/{vacancy['id']}/submit-for-review",
        headers={"Authorization": f"Bearer {recruiter_token}"},
        json={"expected_updated_at": vacancy["updated_at"]},
    )
    assert submitted.status_code == 200
    approved = await client.post(
        f"/api/v1/expert/vacancies/{vacancy['id']}/approve",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"expected_updated_at": submitted.json()["updated_at"], "comment": "ok"},
    )
    assert approved.status_code == 200
    return recruiter_token, expert_token, approved.json()


def create_payload(**overrides) -> dict:
    payload = {
        "candidate_first_name": "Иван",
        "candidate_last_name": "Петров",
        "candidate_social": "t.me/ivan_p",
        "candidate_email": "ivan@example.com",
        "expires_at": FUTURE(),
    }
    payload.update(overrides)
    return payload


@pytest.mark.anyio
async def test_owner_creates_link_on_approved_vacancy(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)

    created = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "active"
    assert body["token"]
    assert body["candidate_first_name"] == "Иван"

    second = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )
    assert second.status_code == 201
    assert second.json()["token"] != body["token"]


@pytest.mark.anyio
async def test_create_refused_for_unapproved_vacancy(client) -> None:
    token = await register_recruiter(client)
    vacancy = await create_vacancy(client, token, interview_time_limit_minutes=45)

    response = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )
    assert response.status_code == 409
    assert "approved" in response.json()["detail"]


@pytest.mark.anyio
async def test_create_refused_when_time_limit_not_set(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client, with_limit=False)

    response = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )
    assert response.status_code == 409
    assert "time limit" in response.json()["detail"]


@pytest.mark.anyio
async def test_create_refused_for_non_owner(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    other = await register_recruiter(client, email="other@example.com")

    response = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {other}"},
        json=create_payload(),
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_create_validates_expiration_and_required_fields(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)

    past = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(expires_at=(datetime.now(UTC) - timedelta(hours=1)).isoformat()),
    )
    assert past.status_code == 422

    empty_name = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(candidate_first_name=""),
    )
    assert empty_name.status_code == 422


@pytest.mark.anyio
async def test_expert_can_list_but_not_create(client) -> None:
    token, expert_token, vacancy = await setup_approved_vacancy(client)
    await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )

    listed = await client.get(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {expert_token}"},
    )
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1

    created = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {expert_token}"},
        json=create_payload(),
    )
    assert created.status_code == 403


@pytest.mark.anyio
async def test_hiring_manager_has_no_access(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    hm = await create_internal_user(
        client, token, email="hm@example.com", roles=["hiring_manager"], name="HM"
    )
    hm_token = await login(client, hm["email"])

    response = await client.get(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {hm_token}"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_public_card_states(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    created = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )
    link = created.json()

    card = await client.get(f"/api/v1/interview-links/{link['token']}")
    assert card.status_code == 200
    body = card.json()
    assert body["state"] == "available"
    assert body["vacancy_title"] == vacancy["title"]
    assert body["interview_time_limit_minutes"] == 45

    missing = await client.get("/api/v1/interview-links/does-not-exist")
    assert missing.status_code == 404


@pytest.mark.anyio
async def test_public_start_and_idempotent_refusal(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    created = await client.post(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
        json=create_payload(),
    )
    link_token = created.json()["token"]

    started = await client.post(f"/api/v1/interview-links/{link_token}/start")
    assert started.status_code == 200
    body = started.json()
    assert body["state"] == "in_progress"
    assert body["deadline_at"] is not None

    again = await client.post(f"/api/v1/interview-links/{link_token}/start")
    assert again.status_code == 409
    assert "already started" in again.json()["detail"]

    listed = await client.get(
        LINKS_URL.format(vacancy_id=vacancy["id"]),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.json()["items"][0]["status"] == "in_progress"


@pytest.mark.anyio
async def test_public_card_reports_unavailable_reasons(client, db_session) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    from uuid import UUID

    from sqlalchemy import update as sql_update

    from app.models.interview_link import InterviewLink

    expired_link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()
    await db_session.execute(
        sql_update(InterviewLink)
        .where(InterviewLink.id == UUID(expired_link["id"]))
        .values(expires_at=datetime.now(UTC) - timedelta(hours=1))
    )
    await db_session.commit()
    card = await client.get(f"/api/v1/interview-links/{expired_link['token']}")
    assert card.json()["state"] == "unavailable"
    assert card.json()["reason"] == "expired"

    revoked_link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()
    await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{revoked_link['id']}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    card = await client.get(f"/api/v1/interview-links/{revoked_link['token']}")
    assert card.json()["state"] == "unavailable"
    assert card.json()["reason"] == "revoked"

    blocked_link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()
    edited = await client.patch(
        f"/api/v1/vacancies/{vacancy['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_updated_at": vacancy["updated_at"], "title": vacancy["title"] + " (v2)"},
    )
    assert edited.status_code == 200
    assert edited.json()["status"] == "draft"
    card = await client.get(f"/api/v1/interview-links/{blocked_link['token']}")
    assert card.json()["state"] == "unavailable"
    assert card.json()["reason"] == "vacancy_closed"

    start_blocked = await client.post(f"/api/v1/interview-links/{blocked_link['token']}/start")
    assert start_blocked.status_code == 409


@pytest.mark.anyio
async def test_owner_revokes_active_link(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()

    revoked = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"

    card = await client.get(f"/api/v1/interview-links/{link['token']}")
    assert card.json()["state"] == "unavailable"
    assert card.json()["reason"] == "revoked"

    again = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert again.status_code == 409


@pytest.mark.anyio
async def test_owner_extends_active_link(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()

    new_expiration = (datetime.now(UTC) + timedelta(days=14)).isoformat()
    extended = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/extend",
        headers={"Authorization": f"Bearer {token}"},
        json={"expires_at": new_expiration},
    )
    assert extended.status_code == 200
    assert extended.json()["status"] == "active"
    assert extended.json()["expires_at"] is not None

    past = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/extend",
        headers={"Authorization": f"Bearer {token}"},
        json={"expires_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
    )
    assert past.status_code == 422


@pytest.mark.anyio
async def test_extend_refused_for_revoked_link(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()
    await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )

    extended = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/extend",
        headers={"Authorization": f"Bearer {token}"},
        json={"expires_at": (datetime.now(UTC) + timedelta(days=14)).isoformat()},
    )
    assert extended.status_code == 409


@pytest.mark.anyio
async def test_revoke_and_extend_refused_for_non_owner(client) -> None:
    token, _, vacancy = await setup_approved_vacancy(client)
    link = (
        await client.post(
            LINKS_URL.format(vacancy_id=vacancy["id"]),
            headers={"Authorization": f"Bearer {token}"},
            json=create_payload(),
        )
    ).json()
    other = await register_recruiter(client, email="intruder@example.com")

    revoked = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/revoke",
        headers={"Authorization": f"Bearer {other}"},
    )
    assert revoked.status_code == 403

    extended = await client.post(
        f"{LINKS_URL.format(vacancy_id=vacancy['id'])}/{link['id']}/extend",
        headers={"Authorization": f"Bearer {other}"},
        json={"expires_at": (datetime.now(UTC) + timedelta(days=14)).isoformat()},
    )
    assert extended.status_code == 403
