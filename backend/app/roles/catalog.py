from app.roles.models import Capability, CapabilityKind, RoleDefinition, RoleRegistry

AREA_RECRUITER_WORKSPACE = "area.recruiter_workspace"
AREA_HIRING_MANAGER_REVIEW = "area.hiring_manager_review"
AREA_EXPERT_QUESTIONS = "area.expert_questions"

ACTION_INTERNAL_USERS_MANAGE = "action.internal_users.manage"
ACTION_QUESTIONS_EDIT = "action.questions.edit"
ACTION_VACANCIES_MANAGE = "action.vacancies.manage"
ACTION_VACANCIES_REVIEW = "action.vacancies.review"

# Paths are frontend routing metadata for landing areas; they live next to the
# capability catalog so new areas declare their route in one place.
AREA_PATHS: dict[str, str] = {
    AREA_RECRUITER_WORKSPACE: "/internal/recruiter",
    AREA_HIRING_MANAGER_REVIEW: "/internal/hiring-manager",
    AREA_EXPERT_QUESTIONS: "/internal/expert",
}

BUILTIN_CAPABILITIES: tuple[Capability, ...] = (
    Capability(id=AREA_RECRUITER_WORKSPACE, kind=CapabilityKind.AREA, label="Recruiter workspace"),
    Capability(id=AREA_HIRING_MANAGER_REVIEW, kind=CapabilityKind.AREA, label="Hiring manager workspace"),
    Capability(id=AREA_EXPERT_QUESTIONS, kind=CapabilityKind.AREA, label="Expert workspace"),
    Capability(id=ACTION_INTERNAL_USERS_MANAGE, kind=CapabilityKind.ACTION, label="Manage internal users"),
    Capability(id=ACTION_QUESTIONS_EDIT, kind=CapabilityKind.ACTION, label="Edit interview questions"),
    Capability(id=ACTION_VACANCIES_MANAGE, kind=CapabilityKind.ACTION, label="Manage recruiter vacancies"),
    Capability(id=ACTION_VACANCIES_REVIEW, kind=CapabilityKind.ACTION, label="Review submitted vacancies"),
)

BUILTIN_ROLES: tuple[RoleDefinition, ...] = (
    RoleDefinition(
        code="recruiter",
        title="Recruiter",
        is_assignable=True,
        sort_order=0,
        capabilities=frozenset(
            {AREA_RECRUITER_WORKSPACE, ACTION_INTERNAL_USERS_MANAGE, ACTION_VACANCIES_MANAGE}
        ),
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
        capabilities=frozenset({AREA_EXPERT_QUESTIONS, ACTION_QUESTIONS_EDIT, ACTION_VACANCIES_REVIEW}),
    ),
)


def build_default_registry() -> RoleRegistry:
    return RoleRegistry(
        capabilities={capability.id: capability for capability in BUILTIN_CAPABILITIES},
        roles={role.code: role for role in BUILTIN_ROLES},
    )
