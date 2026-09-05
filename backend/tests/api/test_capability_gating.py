import pytest

from app.main import app
from app.repositories.user_repository import UserRepository
from app.roles.catalog import ACTION_QUESTIONS_EDIT
from app.roles.models import Capability, CapabilityKind, RoleDefinition, RoleRegistry
from app.services.role_service import RoleService, RoleStillAssignedError
from app.services.user_admin_service import InvalidRoleAssignmentError, UserAdminService
from tests.conftest import create_internal_user, login, register_recruiter


@pytest.mark.anyio
async def test_capability_gating_allows_and_denies_question_editing(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(client, token, email="expert@example.com", roles=["expert"])
    await create_internal_user(client, token, email="manager@example.com", roles=["hiring_manager"])

    expert_token = await login(client, "expert@example.com")
    manager_token = await login(client, "manager@example.com")

    allowed = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {expert_token}"},
        json={"text": "What is ACID?"},
    )
    denied = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"text": "What is ACID?"},
    )
    unauthenticated = await client.post("/api/v1/questions", json={"text": "What is ACID?"})

    assert allowed.status_code == 201
    assert denied.status_code == 403
    assert unauthenticated.status_code == 401


@pytest.mark.anyio
async def test_recruiter_plus_expert_edits_questions_in_one_session(client) -> None:
    token = await register_recruiter(client)
    await create_internal_user(
        client, token, email="combo@example.com", roles=["recruiter", "expert"]
    )
    combo_token = await login(client, "combo@example.com")

    response = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {combo_token}"},
        json={"text": "Explain REST."},
    )

    assert response.status_code == 201


@pytest.mark.anyio
async def test_recruiter_without_capability_is_denied_question_editing(client) -> None:
    token = await register_recruiter(client)

    response = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Should be denied."},
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_role_retirement_guard_rejects_live_assignments(client, db_session) -> None:
    token = await register_recruiter(client)
    await create_internal_user(client, token, email="expert@example.com", roles=["expert"])

    user_repo = UserRepository(db_session)
    admin_service = UserAdminService(user_repo, app.state.role_service)

    # Retiring "expert" is rejected while the assignment exists (FR-024).
    with pytest.raises(InvalidRoleAssignmentError):
        await admin_service.ensure_role_can_retire("expert")

    # Built-in "recruiter" also has a live assignment (the registered recruiter).
    with pytest.raises(RoleStillAssignedError):
        await app.state.role_service.ensure_role_unassigned("recruiter", user_repo)

    # After removing all assignments of the code, the guard passes.
    expert = await user_repo.get_by_email("expert@example.com")
    assert expert is not None
    await user_repo.remove_role_assignment(expert.id, "expert")
    await user_repo.commit()
    await app.state.role_service.ensure_role_unassigned("expert", user_repo)


@pytest.mark.anyio
async def test_custom_registry_capability_extends_access_without_route_changes(client) -> None:
    registry = RoleRegistry(
        capabilities={
            capability.id: capability
            for capability in [
                Capability(
                    id="area.recruiter_workspace",
                    kind=CapabilityKind.AREA,
                    label="Recruiter workspace",
                ),
                Capability(
                    id="area.expert_questions",
                    kind=CapabilityKind.AREA,
                    label="Expert workspace",
                ),
                Capability(
                    id="area.hiring_manager_review",
                    kind=CapabilityKind.AREA,
                    label="Hiring manager workspace",
                ),
                Capability(
                    id="action.internal_users.manage",
                    kind=CapabilityKind.ACTION,
                    label="Manage internal users",
                ),
                Capability(
                    id=ACTION_QUESTIONS_EDIT,
                    kind=CapabilityKind.ACTION,
                    label="action.questions.edit",
                ),
            ]
        },
        roles={
            "recruiter": RoleDefinition(
                code="recruiter",
                title="Recruiter",
                sort_order=0,
                capabilities=frozenset({"area.recruiter_workspace", "action.internal_users.manage"}),
            ),
            "hiring_manager": RoleDefinition(
                code="hiring_manager",
                title="Hiring manager",
                sort_order=1,
                capabilities=frozenset({"area.hiring_manager_review"}),
            ),
            "expert": RoleDefinition(
                code="expert",
                title="Expert",
                sort_order=2,
                capabilities=frozenset({"area.expert_questions", ACTION_QUESTIONS_EDIT}),
            ),
            # New role introduced through the registry only (US-3/SC-006):
            "methodologist": RoleDefinition(
                code="methodologist",
                title="Methodologist",
                sort_order=3,
                capabilities=frozenset({ACTION_QUESTIONS_EDIT}),
            ),
        },
    )
    app.state.role_service = RoleService(registry)

    token = await register_recruiter(client)
    await create_internal_user(
        client, token, email="methodologist@example.com", roles=["methodologist"]
    )
    methodologist_token = await login(client, "methodologist@example.com")

    response = await client.post(
        "/api/v1/questions",
        headers={"Authorization": f"Bearer {methodologist_token}"},
        json={"text": "Registry-only role can edit questions."},
    )

    assert response.status_code == 201
