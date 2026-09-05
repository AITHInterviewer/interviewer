# Data Model: Extensible Multi-Role Internal Users

## Entity: Internal Account

**Purpose**: Represents one internal person with a single sign-in identity, audit trail, and ownership metadata regardless of how many business roles they hold.

**Fields**:
- `id`: Unique internal account identifier.
- `email`: Unique work email used for sign-in; globally unique across internal accounts.
- `name`: Display name shown in internal workspaces.
- `password_hash`: Protected credential record for password-based sign-in.
- `created_by_user_id`: Optional link to the recruiter who created the account.
- `must_rotate_password`: Boolean flag reserved for future password rotation flows.
- `created_at`: Account creation timestamp.
- `last_login_at`: Most recent successful sign-in timestamp.

**Validation Rules**:
- `email` must be unique across all internal accounts.
- `name` must be present.
- An internal account must always retain at least one assigned role (enforced via assignments).

**Relationships**:
- One internal account has many role assignments.
- One internal account may be created by another internal account.
- One recruiter account may create many managed internal accounts.

**Migration**: the current `internal_users.role` enum column is removed; each existing account's role value becomes one row in `internal_role_assignments`. Identity, ownership, and audit fields are untouched.

## Entity: Role Assignment

**Purpose**: Connects one internal account to one registry role code without duplicating the underlying user identity.

**Fields**:
- `user_id`: Internal account receiving the role.
- `role_code`: Assigned role identifier (plain string; must exist in the role registry and be assignable).
- `assigned_by_user_id`: Internal account that granted the role when available.
- `assigned_at`: Assignment timestamp.

**Validation Rules**:
- The pair `user_id + role_code` must be unique.
- Duplicate assignment attempts must not create duplicate records.
- Removing a role must be rejected if it would leave the internal account with zero roles.
- `role_code` must reference a registry entry with `is_assignable = true`; unknown codes are rejected.

**Relationships**:
- Many role assignments belong to one internal account.
- Many role assignments reference one role registry entry (by code).

## Entity: Capability Catalog Entry

**Purpose**: One canonical, named internal area or action that role definitions can grant and that protected scenarios can require. Lives in the declarative registry module, not in the database.

**Fields**:
- `id`: Canonical unique identifier. Convention: `area.<snake_case>` for navigable sections (e.g. `area.recruiter_workspace`, `area.expert_questions`) and `action.<snake_case>` for protected operations (e.g. `action.questions.edit`).
- `kind`: `area` | `action`.
- `label`: Human-readable label used in landing payloads and debugging.

**Validation Rules**:
- `id` must be unique across the whole catalog regardless of kind.
- Catalog entries are defined once in the registry module; code sites reference exported constants, never string literals.

**Relationships**:
- One capability can be granted by many role definitions.

## Entity: Role Registry Entry (Role Definition)

**Purpose**: Declarative definition of one supported internal role — the only artifact that changes when a new role is introduced.

**Fields**:
- `code`: Canonical unique role identifier stored in assignments (e.g. `recruiter`, `hiring_manager`, `expert`, `methodologist`).
- `title`: Human-readable label for UI and documentation.
- `is_assignable`: Whether the administration flow may assign this role (default `true`).
- `sort_order`: Stable ordering hint for UI presentation.
- `capabilities`: Set of capability catalog ids granted by this role (areas and actions combined).

**Validation Rules** (applied at startup, malformed registry → clear error, never partially applied):
- `code` must be unique across the registry and match `^[a-z][a-z0-9_]*$` so historical assignments stay valid.
- Every id in `capabilities` must exist in the capability catalog.
- Built-in codes `recruiter`, `hiring_manager`, `expert` must exist (regression baseline).
- A role may declare an empty capability set; it remains assignable but unlocks nothing.

**Relationships**:
- One role grants many capabilities.
- Many role assignments reference one role code.

## Entity: Role Registry

**Purpose**: The in-memory collection of all role definitions plus the capability catalog, loaded and validated once at application startup and immutable afterwards (until restart with a new registry version).

**Derived Views**:
- `assignable_roles()`: entries with `is_assignable = true`, ordered by `sort_order` — served via the registry snapshot endpoint.
- `capabilities_for_roles(role_codes)`: union of capability ids across the given roles — used by access checks, landing, and audit.

## Entity: Effective Access Set (per signed-in user)

**Purpose**: The computed union of capabilities for one account's currently assigned roles; the single input to every access decision.

**Fields**:
- `roles`: Assigned role codes (from assignments).
- `capabilities`: Union of capabilities of those roles per the registry.
- `areas`: Capabilities of kind `area`.
- `actions`: Capabilities of kind `action`.

**Rules**:
- Computed at request/landing resolution time from current assignments + registry; never persisted.
- Union-only: a role never subtracts access granted by another role.
- Unknown role codes in assignments are ignored for capability computation and surface as a data-integrity signal in logs, never as granted access.

## Entity: Landing Profile

**Purpose**: Describes the internal areas and actions available to the signed-in user, derived from the effective access set.

**Fields**:
- `roles`: Full set of assigned role codes.
- `available_areas`: Navigable internal sections unlocked by the effective access set (each with id, label, path).
- `available_actions`: Combined actions from the effective access set.
- `default_path`: Preferred first destination when entering `/internal`; must be one of the available area paths.

**Validation Rules**:
- `roles` must reflect the persisted assigned-role set.
- `default_path` must be one of the available areas.

## Removal / Deactivation Guard (FR-024)

- Registry entries are edited in the declarative module by the development team; the service-layer guard `ensure_role_unassigned(code)` verifies the assignment count for that code is zero before a retirement change ships.
- The guard is executed by role-management operations in the current administration flow; startup validation in dev/test fixtures with assignments additionally catches violations early.

## Identity and Uniqueness Rules

- One person is represented by one internal account.
- Role growth happens by changing assignments, not by creating duplicate accounts.
- A recruiter-created account keeps the same identity and ownership trail even as roles change.
- One role code = one registry entry; assignments reference codes, never duplicate identity.

## Lifecycle Notes

1. Recruiter self-registers and receives the recruiter role (one assignment).
2. Recruiter creates another internal account with an initial supported role set.
3. Authorized user adds or removes supported roles from an existing internal account.
4. User signs in and receives one session tied to one internal identity plus the full assigned role set.
5. Access checks and landing behavior are derived from the current assignments + registry capability mapping.
6. New role onboarding: developer adds capability/role definitions to the registry; no code changes elsewhere.
7. Role retirement: remove assignments of that code, then remove the registry entry; guard enforces the order.

## Migration Impact (from current single-role model)

- Existing `internal_users.role` enum column is dropped; each account gets one `internal_role_assignments` row with its previous role value.
- Existing recruiter ownership via `created_by_user_id` remains unchanged.
- Session and response payloads move from singular `role` values to `roles` collections.
- Existing session and response payloads for clients move from role equality checks to capability/landing-driven behavior.
- No new tables beyond `internal_role_assignments`; the registry adds no tables.
