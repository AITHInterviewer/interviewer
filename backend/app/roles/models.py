import enum

from pydantic import BaseModel, Field


class CapabilityKind(str, enum.Enum):
    AREA = "area"
    ACTION = "action"


class Capability(BaseModel):
    id: str = Field(min_length=1)
    kind: CapabilityKind
    label: str = Field(min_length=1)


class RoleDefinition(BaseModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    title: str = Field(min_length=1)
    is_assignable: bool = True
    sort_order: int = 0
    capabilities: frozenset[str] = frozenset()


class RoleRegistry(BaseModel):
    capabilities: dict[str, Capability]
    roles: dict[str, RoleDefinition]

    def assignable_roles(self) -> list[RoleDefinition]:
        return sorted(
            (role for role in self.roles.values() if role.is_assignable),
            key=lambda role: (role.sort_order, role.code),
        )

    def capabilities_for_roles(self, role_codes: list[str] | set[str] | tuple[str, ...]) -> set[str]:
        granted: set[str] = set()
        for code in role_codes:
            role = self.roles.get(code)
            if role is None:
                continue
            granted.update(role.capabilities)
        return granted
