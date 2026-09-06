from app.config import settings
from app.roles.catalog import AREA_PATHS, build_default_registry
from app.roles.models import Capability, CapabilityKind, RoleDefinition, RoleRegistry
from app.roles.validation import validate_registry
from app.schemas.auth import InternalUserLandingResponse, LandingArea


class UnknownRoleError(Exception):
    """Raised when a role code is not present in the registry."""


class RoleNotAssignableError(Exception):
    """Raised when a registry role exists but is not assignable."""


class RoleStillAssignedError(Exception):
    """Raised when retiring a role that still has live assignments (FR-024)."""


class RoleService:
    def __init__(
        self,
        registry: RoleRegistry | None = None,
        admin_emails: list[str] | tuple[str, ...] | None = None,
    ) -> None:
        self.registry = registry if registry is not None else build_default_registry()
        configured_admins = settings.admin_emails if admin_emails is None else admin_emails
        self.admin_emails = {email.strip().lower() for email in configured_admins if email.strip()}
        validate_registry(self.registry)

    def get_role(self, code: str) -> RoleDefinition:
        role = self.registry.roles.get(code)
        if role is None:
            raise UnknownRoleError(f"Unknown role code: {code!r}.")
        return role

    def require_assignable(self, code: str) -> RoleDefinition:
        role = self.get_role(code)
        if not role.is_assignable:
            raise RoleNotAssignableError(f"Role {code!r} is not assignable.")
        return role

    def validate_assignable_roles(self, codes: list[str]) -> None:
        for code in codes:
            self.require_assignable(code)

    def assignable_roles(self) -> list[RoleDefinition]:
        return self.registry.assignable_roles()

    def capabilities_for_roles(self, role_codes: list[str]) -> set[str]:
        return self.registry.capabilities_for_roles(role_codes)

    def is_admin(self, email: str | None) -> bool:
        return bool(email and email.strip().lower() in self.admin_emails)

    def capabilities_for_user(self, role_codes: list[str], email: str | None) -> set[str]:
        if self.is_admin(email):
            return set(self.registry.capabilities)
        return self.capabilities_for_roles(role_codes)

    def granted_capabilities(
        self,
        role_codes: list[str],
        kind: CapabilityKind,
        *,
        email: str | None = None,
    ) -> list[Capability]:
        granted_ids = self.capabilities_for_user(role_codes, email)
        capabilities = [
            capability
            for capability_id, capability in self.registry.capabilities.items()
            if capability_id in granted_ids and capability.kind is kind
        ]
        return sorted(capabilities, key=lambda capability: capability.id)

    def build_landing(
        self, role_codes: list[str], *, email: str | None = None
    ) -> InternalUserLandingResponse:
        # Order areas by the priority of the role that grants them so the
        # default path lands on the user's primary workspace.
        priority_codes = set(self.registry.roles) if self.is_admin(email) else set(role_codes)
        role_priority = {
            code: role.sort_order for code, role in self.registry.roles.items() if code in priority_codes
        }

        def area_priority(capability: Capability) -> tuple[int, str]:
            granting_priorities = [
                role_priority[role.code]
                for role in self.registry.roles.values()
                if role.code in role_priority and capability.id in role.capabilities
            ]
            return (min(granting_priorities) if granting_priorities else len(role_priority), capability.id)

        area_capabilities = self.granted_capabilities(role_codes, CapabilityKind.AREA, email=email)
        area_capabilities.sort(key=area_priority)
        areas = [
            LandingArea(id=capability.id, label=capability.label, path=AREA_PATHS[capability.id])
            for capability in area_capabilities
            if capability.id in AREA_PATHS
        ]
        actions = [
            capability.id
            for capability in self.granted_capabilities(role_codes, CapabilityKind.ACTION, email=email)
        ]
        default_path = areas[0].path if areas else "/internal"
        return InternalUserLandingResponse(
            roles=list(role_codes),
            default_path=default_path,
            available_areas=areas,
            available_actions=actions,
        )

    async def ensure_role_unassigned(self, role_code: str, user_repository) -> None:
        self.get_role(role_code)
        assigned_count = await user_repository.count_assignments_by_role(role_code)
        if assigned_count > 0:
            raise RoleStillAssignedError(
                f"Role {role_code!r} still has {assigned_count} assignment(s); remove them first."
            )
