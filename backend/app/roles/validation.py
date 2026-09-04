from app.roles.models import RoleRegistry

BUILTIN_ROLE_CODES = ("recruiter", "hiring_manager", "expert")


class RegistryValidationError(Exception):
    """Raised when the declarative role registry is malformed."""


def validate_registry(registry: RoleRegistry) -> None:
    seen_capability_ids: set[str] = set()
    for capability in registry.capabilities.values():
        if capability.id in seen_capability_ids:
            raise RegistryValidationError(f"Duplicate capability id in registry: {capability.id!r}.")
        seen_capability_ids.add(capability.id)
        expected_prefix = f"{capability.kind.value}."
        if not capability.id.startswith(expected_prefix):
            raise RegistryValidationError(
                f"Capability id {capability.id!r} must start with {expected_prefix!r}."
            )

    seen_role_codes: set[str] = set()
    for role in registry.roles.values():
        if role.code in seen_role_codes:
            raise RegistryValidationError(f"Duplicate role code in registry: {role.code!r}.")
        seen_role_codes.add(role.code)
        for capability_id in sorted(role.capabilities):
            if capability_id not in registry.capabilities:
                raise RegistryValidationError(
                    f"Role {role.code!r} references unknown capability {capability_id!r}."
                )

    for code in BUILTIN_ROLE_CODES:
        if code not in registry.roles:
            raise RegistryValidationError(f"Built-in role {code!r} is missing from the registry.")
