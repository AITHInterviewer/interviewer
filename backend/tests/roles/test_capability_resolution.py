import pytest

from app.roles.catalog import (
    ACTION_QUESTIONS_EDIT,
    ACTION_VACANCIES_MANAGE,
    ACTION_VACANCIES_REVIEW,
    build_default_registry,
)
from app.roles.models import Capability, CapabilityKind, RoleDefinition, RoleRegistry


@pytest.mark.anyio
async def test_capabilities_union_across_multiple_roles() -> None:
    registry = build_default_registry()

    granted = registry.capabilities_for_roles(["recruiter", "expert"])

    assert granted == {
        "area.recruiter_workspace",
        "action.internal_users.manage",
        "area.expert_questions",
        ACTION_QUESTIONS_EDIT,
        ACTION_VACANCIES_MANAGE,
        ACTION_VACANCIES_REVIEW,
    }



@pytest.mark.anyio
async def test_empty_capability_set_role_grants_nothing() -> None:
    registry = RoleRegistry(
        capabilities={},
        roles={
            "observer": RoleDefinition(
                code="observer", title="Observer", capabilities=frozenset()
            ),
        },
    )

    assert registry.capabilities_for_roles(["observer"]) == set()



@pytest.mark.anyio
async def test_unknown_role_codes_are_ignored() -> None:
    registry = build_default_registry()

    granted = registry.capabilities_for_roles(["expert", "ghost_role"])

    assert "ghost_role" not in registry.roles
    assert ACTION_QUESTIONS_EDIT in granted



@pytest.mark.anyio
async def test_assignable_roles_sorted_by_sort_order() -> None:
    registry = build_default_registry()

    ordered = [role.code for role in registry.assignable_roles()]

    assert ordered == ["recruiter", "hiring_manager", "expert"]



@pytest.mark.anyio
async def test_mapping_change_extends_role_without_code_changes() -> None:
    # SC-009: granting an additional capability to an existing role takes
    # effect through the mapping alone.
    registry = build_default_registry()
    registry.roles["hiring_manager"] = registry.roles["hiring_manager"].model_copy(
        update={"capabilities": frozenset({"area.hiring_manager_review", ACTION_QUESTIONS_EDIT})}
    )

    assert ACTION_QUESTIONS_EDIT in registry.capabilities_for_roles(["hiring_manager"])



@pytest.mark.anyio
async def test_registry_only_new_role_is_immediately_effective() -> None:
    # SC-006: a new role definition + capability is effective by construction.
    registry = build_default_registry()
    registry.capabilities["area.methodology"] = Capability(
        id="area.methodology", kind=CapabilityKind.AREA, label="Methodology workspace"
    )
    registry.roles["methodologist"] = RoleDefinition(
        code="methodologist",
        title="Methodologist",
        sort_order=3,
        capabilities=frozenset({"area.methodology"}),
    )

    assert "area.methodology" in registry.capabilities_for_roles(["methodologist"])
    assert "methodologist" in {role.code for role in registry.assignable_roles()}
