# Research: Extensible Multi-Role Internal Users

Merged research for the unified feature: multi-role assignment model (original 007) plus the declarative registry and capability layer (merged from 008). Baseline is the current single-role implementation (feature 006 era): `internal_users.role` enum column and hardcoded role-equality checks.

## Decision 1: Represent role membership as normalized assignments on one internal account

- **Decision**: Keep `Internal Account` as the single identity record and move role membership to a separate role-assignment table (`user_id + role_code`, unique together); migrate existing single-role accounts by converting their current `role` value into one assignment.
- **Rationale**: One internal identity for sign-in, ownership, and audit; a normalized assignment model satisfies multi-role, prevents duplicates at the schema level, and keeps historical accounts valid without recreation.
- **Alternatives considered**:
  - Keep one `role` field and duplicate accounts per responsibility. Rejected: breaks single identity, audit ambiguity.
  - Store roles in an array/JSON column on the user record. Rejected: weaker integrity, duplicate prevention harder, no assignment metadata.
  - Bitmask of roles. Rejected: hard to inspect and evolve, unclear in contracts and tests.

## Decision 2: Make authorization depend on the user's full role set, resolved via capabilities from a declarative registry

- **Decision**: Evaluate protected actions against the union of capabilities of the user's assigned roles, where capabilities come from a single declarative role registry (see Decisions 6–8). Access checks never compare role codes directly.
- **Rationale**: The recruiter-plus-expert scenario requires union-based decisions; capability indirection means new roles and capability grants never touch protected-scenario code.
- **Alternatives considered**:
  - One primary role per session. Rejected: loses valid access, forces context switching.
  - Separate sessions per role. Rejected: recreates account fragmentation at session level.
  - Per-route role lists (`roles=["expert"]`). Rejected: still scattered role-code comparisons; adding a capability to a role requires touching routes.

## Decision 3: Keep the database as the authorization source of truth after sign-in

- **Decision**: The token carries identity; current role assignments are loaded from persisted state for access checks. Role lists in payloads are client conveniences, not the trusted source.
- **Rationale**: The backend already reloads the current user per request; extending that pattern ensures role changes take effect immediately (FR-013).
- **Alternatives considered**:
  - Trust token-embedded roles until expiry. Rejected: removed privileges stay active too long.
  - Frontend-only role re-fetch. Rejected: authorization must be server-side.

## Decision 4: Expand API contracts to `roles` collections, explicit role management, and a registry snapshot

- **Decision**: Auth and internal-user APIs expose full role sets; internal-user management supports add/remove assignments; a new `GET /api/v1/internal/roles` returns the assignable registry snapshot (code, title, sort_order) so clients render role options and labels without hardcoding.
- **Rationale**: One clear contract for multi-role users; the snapshot endpoint removes the last client-side hardcoding of role lists.
- **Alternatives considered**:
  - Keep old single-role responses. Rejected: hides real access state.
  - Ship registry data only inside auth/landing payloads. Rejected: admin assignment UI needs the snapshot before any landing exists.

## Decision 5: Preserve current UX shape but make it data-driven

- **Decision**: Keep the existing recruiter workspace and protected internal routes; landing/navigation derive from the landing payload (`default_path`, `available_areas`) instead of a hardcoded role→route switch; role labels and assignment options render from the registry snapshot.
- **Rationale**: Minimal user-facing disruption (FR-007, FR-015, FR-020) while removing client-side extensibility blockers.
- **Alternatives considered**:
  - Brand-new dashboard for all roles. Rejected: scope creep beyond the request.
  - One-route-per-role redirection kept. Rejected: blocks combined-role access.

## Decision 6: Role registry as a typed declarative module validated at startup

- **Decision**: A backend package (`backend/app/roles/`) holds Pydantic models for the capability catalog and role definitions plus the built-in registry data; the registry loads and validates once at application startup and is held in memory. Malformed registries (duplicate codes, unknown capability references, missing built-in roles) fail startup with a clear error and are never partially applied.
- **Rationale**: FastAPI + Pydantic stack gives startup validation for free; typed module is testable; matches the clarified scope (declarative config/seed maintained by developers, no runtime role-management UI).
- **Alternatives considered**:
  - YAML/JSON config file: adds a parsing layer and weaker typing without demonstrated need. Rejected (constitution V).
  - DB-backed registry: runtime editing not required by scope; adds seed/migration and runtime validation burden. Rejected.
  - In-code enums (status quo): adding a role requires editing every switch on it — the exact non-extensibility being removed. Rejected.

## Decision 7: Single capability catalog with closed validation

- **Decision**: The registry module defines the canonical catalog of areas (`area.*`, navigable sections) and actions (`action.*`, protected operations, e.g. `action.questions.edit`). Role definitions reference catalog ids; startup validation rejects references to unknown ids. Code sites use exported constants, never string literals.
- **Rationale**: FR-017/FR-021 require a declared mapping and rejection of unknown references; one catalog makes "known areas and actions" a closed, validated set shared by backend checks and the landing contract.
- **Alternatives considered**:
  - Free-form capability strings: unvalidatable. Rejected.
  - Separate files for catalog and mapping: two sources of truth. Rejected.

## Decision 8: No new DB tables for the registry; guard for role retirement

- **Decision**: The registry is in-memory metadata; assignments store role codes as strings and remain valid while their codes exist (FR-022). Retiring a registry code is rejected while any assignment references it (FR-024), enforced by a service-layer guard counting assignments per role code.
- **Rationale**: Minimal diff to the persistence model; no sync concerns between DB and code-shipped registry.
- **Alternatives considered**:
  - Mirror registry into DB at startup: duplicated state without a runtime requirement. Rejected.

## Sequencing note

The target state is implemented in one delivery (no intermediate "multi-role with hardcoded checks" release): migrate the existing `role` column to assignments, introduce the registry, and switch gating to capabilities in the same change set. The built-in registry definitions (recruiter, hiring_manager, expert) are the single place where current behavior is encoded; the regression story proves parity.

## Resolved NEEDS CLARIFICATION

None remain. Clarifications received during specification: (Q1) the registry is maintained as declarative configuration/seed data by the development team — no runtime role-management UI; (Q2) removing or deactivating a registry role is rejected while it is assigned to any account.
