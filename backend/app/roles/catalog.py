from app.roles.models import Capability, CapabilityKind, RoleDefinition, RoleRegistry

AREA_RECRUITER_WORKSPACE = "area.recruiter_workspace"
AREA_HIRING_MANAGER_REVIEW = "area.hiring_manager_review"
AREA_EXPERT_QUESTIONS = "area.expert_questions"

ACTION_INTERNAL_USERS_MANAGE = "action.internal_users.manage"
ACTION_QUESTIONS_EDIT = "action.questions.edit"

# Paths are frontend routing metadata for landing areas; they live next to the
# capability catalog so new areas declare their route in one place.
AREA_PATHS: dict[str, str] = {
    AREA_RECRUITER_WORKSPACE: "/vacancies",
    AREA_HIRING_MANAGER_REVIEW: "/manager",
    AREA_EXPERT_QUESTIONS: "/expert",
}

BUILTIN_CAPABILITIES: tuple[Capability, ...] = (
    Capability(id=AREA_RECRUITER_WORKSPACE, kind=CapabilityKind.AREA, label="Вакансии"),
    Capability(id=AREA_HIRING_MANAGER_REVIEW, kind=CapabilityKind.AREA, label="Встречи"),
    Capability(id=AREA_EXPERT_QUESTIONS, kind=CapabilityKind.AREA, label="Задачи"),
    Capability(id=ACTION_INTERNAL_USERS_MANAGE, kind=CapabilityKind.ACTION, label="Manage internal users"),
    Capability(id=ACTION_QUESTIONS_EDIT, kind=CapabilityKind.ACTION, label="Edit interview questions"),
)

BUILTIN_ROLES: tuple[RoleDefinition, ...] = (
    RoleDefinition(
        code="recruiter",
        title="Recruiter",
        is_assignable=True,
        sort_order=0,
        capabilities=frozenset({AREA_RECRUITER_WORKSPACE, ACTION_INTERNAL_USERS_MANAGE}),
    ),
    RoleDefinition(
        code="hiring_manager",
        title="Hiring manager",
        is_assignable=True,
        sort_order=1,
        capabilities=frozenset({AREA_HIRING_MANAGER_REVIEW}),
    ),
    RoleDefinition(
        code="expert",
        title="Expert",
        is_assignable=True,
        sort_order=2,
        capabilities=frozenset({AREA_EXPERT_QUESTIONS, ACTION_QUESTIONS_EDIT}),
    ),
)


def build_default_registry() -> RoleRegistry:
    return RoleRegistry(
        capabilities={capability.id: capability for capability in BUILTIN_CAPABILITIES},
        roles={role.code: role for role in BUILTIN_ROLES},
    )
