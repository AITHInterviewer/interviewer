import pytest

from app.roles.models import Capability, CapabilityKind, RoleDefinition, RoleRegistry
from app.roles.validation import RegistryValidationError, validate_registry
from tests.conftest import register_recruiter


def _capability(capability_id: str, kind: CapabilityKind = CapabilityKind.ACTION) -> Capability:
    return Capability(id=capability_id, kind=kind, label=capability_id)


def _builtin_registry() -> RoleRegistry:
    return RoleRegistry(
        capabilities={
            "area.recruiter_workspace": _capability("area.recruiter_workspace", CapabilityKind.AREA),
            "area.expert_questions": _capability("area.expert_questions", CapabilityKind.AREA),
            "area.hiring_manager_review": _capability("area.hiring_manager_review", CapabilityKind.AREA),
            "action.internal_users.manage": _capability("action.internal_users.manage"),
            "action.questions.edit": _capability("action.questions.edit"),
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
                capabilities=frozenset({"area.expert_questions", "action.questions.edit"}),
            ),
        },
    )



@pytest.mark.anyio
async def test_builtin_registry_passes_validation() -> None:
    validate_registry(_builtin_registry())



@pytest.mark.anyio
async def test_unknown_capability_reference_is_rejected() -> None:
    registry = _builtin_registry()
    registry.roles["expert"] = registry.roles["expert"].model_copy(
        update={"capabilities": frozenset({"action.questions.edit", "action.unknown"})}
    )

    with pytest.raises(RegistryValidationError, match="unknown capability"):
        validate_registry(registry)



@pytest.mark.anyio
async def test_missing_builtin_role_is_rejected() -> None:
    registry = _builtin_registry()
    registry.roles.pop("expert")

    with pytest.raises(RegistryValidationError, match="Built-in role"):
        validate_registry(registry)



@pytest.mark.anyio
async def test_capability_id_kind_prefix_mismatch_is_rejected() -> None:
    registry = _builtin_registry()
    registry.capabilities["action.bad_prefix"] = _capability("action.bad_prefix")
    registry.roles["expert"] = registry.roles["expert"].model_copy(
        update={"capabilities": frozenset({"action.bad_prefix"})}
    )
    # id starts with the action prefix but kind is ACTION — valid; force mismatch:
    registry.capabilities["area.bad_prefix"] = Capability(
        id="area.bad_prefix", kind=CapabilityKind.ACTION, label="mismatch"
    )
    registry.roles["hiring_manager"] = registry.roles["hiring_manager"].model_copy(
        update={"capabilities": frozenset({"area.bad_prefix"})}
    )

    with pytest.raises(RegistryValidationError, match="must start with"):
        validate_registry(registry)



@pytest.mark.anyio
async def test_role_service_fails_startup_on_malformed_registry() -> None:
    from app.services.role_service import RoleService

    registry = _builtin_registry()
    registry.roles["expert"] = registry.roles["expert"].model_copy(
        update={"capabilities": frozenset({"action.unknown"})}
    )

    with pytest.raises(RegistryValidationError):
        RoleService(registry)


@pytest.mark.anyio
async def test_registry_snapshot_endpoint(client) -> None:
    token = await register_recruiter(client)

    unauthenticated = await client.get("/api/v1/internal/roles")
    assert unauthenticated.status_code == 401

    response = await client.get("/api/v1/internal/roles", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    items = response.json()["items"]
    assert [entry["code"] for entry in items] == ["recruiter", "hiring_manager", "expert"]
    assert all("title" in entry and "sort_order" in entry for entry in items)
