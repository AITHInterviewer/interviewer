---
description: "Task list for feature 007-extensible-multi-role (merged 007+008)"
---

# Tasks: Extensible Multi-Role Internal Users

**Input**: Design documents from `/specs/007-multi-role-assignment/` (merged scope of former features 007 and 008)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/internal-auth-multirole.openapi.yaml (v0.2.0), quickstart.md

**Tests**: Included — success criteria SC-002/SC-004/SC-007/SC-008 require executable verification; plan.md defines pytest/vitest coverage.

**Organization**: Tasks are grouped by user story. Baseline is the current single-role implementation (`internal_users.role` enum column, hardcoded role-equality checks). The target state is delivered in one pass: no intermediate "multi-role with hardcoded checks" release.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `backend/app/...`, tests in `backend/tests/`
- Frontend: `frontend/...` (Next.js app structure per plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working environment before any change.

- [X] T001 Verify backend and frontend environments run per `specs/002-docker-dev-baseline` quickstart: backend starts, existing test suites (`uv run pytest backend/tests`, `npm --prefix frontend test`) are green on the current single-role code, so every later failure is attributable to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistence migration to assignments, the declarative registry, the access-resolution service, and capability-dependency primitives. No user story work can begin until this phase is complete.

- [X] T002 [P] Update the user model and add the assignment model in `backend/app/models/user.py` and `backend/app/models/role_assignment.py`: remove the `role` column from `InternalUser`; add `InternalRoleAssignment` (`user_id`, `role_code`, `assigned_by_user_id`, `assigned_at`, unique constraint on `user_id + role_code`) per data-model.md
- [X] T003 Create an Alembic migration in `backend/app/migrations/` that creates `internal_role_assignments`, backfills one assignment per existing account from the current `internal_users.role` values, then drops the `role` column; verify existing accounts keep their identity and ownership fields untouched
- [X] T004 [P] Extend `backend/app/repositories/user_repository.py` with assignment persistence: list assignments by user, add assignment (idempotent on duplicates), remove assignment, replace-role-set transactionally, and `count_assignments_by_role(role_code)` for the FR-024 guard
- [X] T005 [P] Implement registry Pydantic models in `backend/app/roles/models.py` per data-model.md: `Capability` (id, kind area|action, label), `RoleDefinition` (code, title, is_assignable, sort_order, capabilities), `RoleRegistry` with `assignable_roles()` and `capabilities_for_roles(role_codes)` (union semantics, FR-023)
- [X] T006 [P] Implement the capability catalog and built-in registry data in `backend/app/roles/catalog.py`: canonical area/action ids (`area.recruiter_workspace`, `area.expert_questions`, `action.questions.edit`, etc.) as exported constants; built-in role definitions for `recruiter`, `hiring_manager`, `expert` reproducing current behavior
- [X] T007 [P] Implement startup validation in `backend/app/roles/validation.py`: reject duplicate capability ids, duplicate role codes, role references to unknown capability ids, and missing built-in roles (recruiter/hiring_manager/expert) — clear error naming the violation, never partially applied (FR-021, SC-008)
- [X] T008 Implement `RoleService` in `backend/app/services/role_service.py`: load and validate the registry once, expose `capabilities_for_roles`, `assignable_roles` ordered by `sort_order`, registry lookup for assignment validation (FR-022), and `ensure_role_unassigned(code)` raising a clear error while assignments exist (FR-024)
- [X] T009 Wire registry loading into the application startup in `backend/app/main.py` and register `RoleService` in the dependency wiring in `backend/app/dependencies/` so a malformed registry fails startup and the service is injectable
- [X] T010 [P] Update auth schemas in `backend/app/schemas/auth.py` per contract v0.2.0: `RoleCode` as a pattern-validated plain string (no enum), `roles` collections (minItems 1, uniqueItems) in `InternalUserCreateRequest`, `InternalUserResponse`, `AuthTokenResponse`, and `RoleAssignmentUpdateRequest` (add_roles/remove_roles)
- [X] T011 [P] Implement capability-aware dependencies in `backend/app/dependencies/auth.py` (or `backend/app/dependencies/access.py` re-exported there): `require_capability(action_id)` and `require_area(area_id)` resolving the current user's assignments → capability union via `RoleService`, returning 403 with a clear message on miss; capability ids come from `backend/app/roles/catalog.py` constants, never string literals (FR-018)

**Checkpoint**: Assignments persisted and migrated; registry loads and validates at startup; capability primitives ready; schemas carry `roles`.

---

## Phase 3: User Story 1 - Назначение нескольких ролей одному аккаунту (Priority: P1) 🎯 MVP

**Goal**: An authorized user can view, add, and remove role assignments on one internal account with duplicate prevention and the at-least-one-role invariant (FR-001–FR-006).

**Independent Test**: Create a managed user with one role, add a second role via the assignment endpoint, confirm one account with the full role set, duplicate add is a no-op, and removing the last role is rejected (spec.md US-1; quickstart steps 4–5).

### Tests for User Story 1

- [X] T012 [P] [US1] API tests in `backend/tests/api/test_role_assignments.py`: create user with multiple roles; add role; duplicate add does not duplicate; remove role; remove-last-role rejected with 400; unknown/non-assignable role code rejected with 400
- [X] T013 [P] [US1] Migration test in `backend/tests/api/test_role_assignments.py` (or dedicated migration test): a pre-migration single-role account loads after migration with exactly one assignment equal to its former role

### Implementation for User Story 1

- [X] T014 [US1] Implement role-assignment endpoints in `backend/app/routers/internal_users.py`: `POST /api/v1/internal-users` with `roles` list; `PATCH /api/v1/internal-users/{user_id}/roles` with `add_roles`/`remove_roles`; responses carry full `roles` per contract; enforce registry validation, duplicate prevention, and the at-least-one-role invariant through `RoleService` and `user_admin_service.py` (depends on T004, T008, T010)
- [X] T015 [US1] Update `backend/app/services/auth_service.py` so session/current-user resolution loads the account's full assignment set (FR-008) and `last_login_at` handling stays unchanged
- [X] T016 [P] [US1] Update `frontend/lib/api.ts` types to `roles: string[]` and the assignment-update client to send `add_roles`/`remove_roles`
- [X] T017 [US1] Update `frontend/components/auth/internal-user-form.tsx` to support selecting multiple roles at creation (multi-select over roles), and `frontend/components/auth/recruiter-workspace.tsx` to display the full role set per user card (labels via helper until US3 wires the snapshot)
- [X] T018 [US1] Keep sign-in flows (`frontend/app/login/page.tsx`, `frontend/app/register/page.tsx`) working with `roles` payloads: pick `roles[0]`-independent behavior is acceptable only as a temporary bridge until US2 lands landing-driven routing

**Checkpoint**: Multi-role assignment works end-to-end on one account; MVP boundary.

---

## Phase 4: User Story 2 - Рекрутёр + эксперт в одной сессии (Priority: P1)

**Goal**: A user holding recruiter and expert roles signs in once and reaches both areas, including capability-gated question editing; a recruiter without the capability is denied (FR-008–FR-011).

**Independent Test**: Assign recruiter+expert to one account, sign in, open the recruiter workspace and the question-editing flow in the same session; sign in as recruiter-only and get 403 on question editing (spec.md US-2; quickstart steps 6–7).

### Tests for User Story 2

- [X] T019 [P] [US2] Gating tests in `backend/tests/api/test_capability_gating.py`: question-editing endpoint allows a user whose union includes `action.questions.edit` and returns 403 otherwise, including the recruiter-without-capability denial (SC-004)
- [X] T020 [P] [US2] Landing tests in `backend/tests/api/test_landing.py`: landing response for recruiter+expert contains both areas; default_path is one of the available areas; single-role landing unchanged in shape

### Implementation for User Story 2

- [X] T021 [US2] Implement `GET /api/v1/internal-users/me/landing` in `backend/app/routers/auth.py`: derive `available_areas`, `available_actions`, and `default_path` from `RoleService.capabilities_for_roles` over the user's current assignments (FR-020, FR-013); keep the contract response shape unchanged
- [X] T022 [US2] Gate the question-editing backend route(s) with `require_capability(ACTION_QUESTIONS_EDIT)` from `backend/app/dependencies/auth.py`, replacing any role-equality check (FR-010, FR-011)
- [X] T023 [US2] Replace the hardcoded `getRolePath` role switch in `frontend/lib/auth.ts` with landing-derived resolution (`default_path`/`available_areas` from the landing payload) and update callers in `frontend/app/page.tsx`, `frontend/app/login/page.tsx`, and `frontend/app/register/page.tsx` (FR-020)
- [X] T024 [US2] Update `frontend/components/auth/protected-role-page.tsx` to authorize pages by required area/capability from the landing payload instead of `expectedRole` string equality, keeping redirect-to-landing behavior; update `frontend/app/internal/**/page.tsx` wrappers accordingly
- [X] T025 [US2] Wire the expert question-editing entry point in the frontend to the landing payload (`available_actions` contains the editing action) so recruiter+expert users see it in the same session

**Checkpoint**: One-session multi-area access works; capability gating enforced server-side.

---

## Phase 5: User Story 3 - Новая роль через декларативный реестр (Priority: P1)

**Goal**: A new role added to the registry only becomes assignable, visible in sign-in, and functional across access checks with no changes outside the registry module (FR-016, FR-019, SC-006).

**Independent Test**: Add a test-only role with a new capability to the registry, restart, confirm the snapshot endpoint lists it, assign it to an existing account, and confirm landing exposes its declared area — without editing sign-in, assignment, or authorization code (spec.md US-3; quickstart step 9).

### Tests for User Story 3

- [X] T026 [P] [US3] Contract test in `backend/tests/api/test_role_registry.py`: authenticated `GET /api/v1/internal/roles` returns assignable entries ordered by `sort_order` with code/title; unauthenticated returns 401
- [X] T027 [P] [US3] Integration test in `backend/tests/api/test_role_registry.py`: with a fixture registry containing an extra role (plus its capability), assigning it through the assignment endpoint succeeds and landing includes the declared area, proving no code outside the registry changed (SC-006)

### Implementation for User Story 3

- [X] T028 [US3] Create response schemas in `backend/app/schemas/roles.py` (`RoleRegistryEntryResponse`, `RoleRegistrySnapshotResponse`) and implement `GET /api/v1/internal/roles` in `backend/app/routers/roles.py` from `RoleService.assignable_roles()`; wire the router into `backend/app/main.py`
- [X] T029 [P] [US3] Add registry snapshot client and types in `frontend/lib/roles.ts` fetching `GET /api/v1/internal/roles` with the existing API client
- [X] T030 [US3] Replace hardcoded role options in `frontend/components/auth/internal-user-form.tsx` with options rendered from the registry snapshot (labels and order from `frontend/lib/roles.ts`)
- [X] T031 [US3] Replace the hardcoded role-label rendering in `frontend/components/auth/recruiter-workspace.tsx` with title lookup from the registry snapshot so new roles render correct labels without frontend changes

**Checkpoint**: Registry-only role addition works end-to-end; client rendering is fully data-driven.

---

## Phase 6: User Story 4 - Возможности управляются отображением роль → возможности (Priority: P1)

**Goal**: No hardcoded role-code access comparisons remain; granting a capability to a role through the mapping changes access without scenario-code edits (FR-018, FR-023, SC-007, SC-009).

**Independent Test**: Static grep finds zero role-equality access checks; a test grants `action.questions.edit` to another role in the fixture registry and confirms that role's users gain access on next sign-in with no changes to protected routes (spec.md US-4; quickstart steps 10–11).

### Tests for User Story 4

- [X] T032 [P] [US4] Unit tests in `backend/tests/roles/test_capability_resolution.py`: union across multiple roles; empty capability sets allowed; unknown role codes in assignments ignored and never grant access
- [X] T033 [P] [US4] Mapping-driven change test in `backend/tests/roles/test_capability_resolution.py`: adding a capability to a role in the fixture registry extends `capabilities_for_roles` for that role's users without touching any route code (SC-009)

### Implementation for User Story 4

- [X] T034 [US4] Replace the remaining hardcoded role-equality gate (`get_recruiter` in `backend/app/dependencies/auth.py`) and any role-code comparisons in `backend/app/routers/` with `require_capability`/`require_area` using catalog constants (user management requires the appropriate management capability/area per the built-in registry)
- [X] T035 [US4] Run the static check from `quickstart.md` step 11 (grep for role-equality access checks across `backend/app/routers/`, `backend/app/dependencies/`, and role-driven switches across `frontend/`); fix stragglers and record the result (SC-007)

**Checkpoint**: 100% of access decisions resolve through the registry capability mapping.

---

## Phase 7: User Story 5 - Существующие роли и сценарии без регрессий (Priority: P2)

**Goal**: Built-in roles keep current behavior; migrated single-role accounts work without recreation; the retirement guard is enforced (FR-007, FR-014, FR-015, FR-024, SC-005).

**Independent Test**: Full regression pass on the built-in registry: single-role sign-in and navigation unchanged; recruiter+expert question editing works; recruiter-only denied; retirement of an assigned role code is rejected until assignments are removed; backend + frontend suites green (spec.md US-5; quickstart step 8).

### Tests for User Story 5

- [X] T036 [P] [US5] Regression tests in `backend/tests/api/test_multirole_regression.py`: single-role account lands as before; recruiter+expert passes capability-gated question editing; recruiter-only denied — all against the built-in registry only
- [X] T037 [P] [US5] Guard test: retiring a role code with live assignments is rejected until assignments are removed, then succeeds (FR-024); startup validation rejects each malformed registry variant (SC-008)

### Implementation for User Story 5

- [X] T038 [US5] Verify built-in registry parity in `backend/app/roles/catalog.py`: `recruiter`, `hiring_manager`, `expert` grant exactly the areas/actions reproducing pre-change behavior; adjust definitions until T036 passes
- [X] T039 [US5] Verify no account recreation is needed: seeded/migrated accounts load and resolve correctly against the built-in registry; document the confirmation in the feature notes (FR-015)

**Checkpoint**: Regression proven; guard rails enforced.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and traceability.

- [X] T040 [P] Run the full `specs/007-multi-role-assignment/quickstart.md` validation sequence (steps 1–11) against a clean environment and record results against SC-001–SC-009
- [X] T041 [P] Update `specs/006-recruiter-auth/spec.md` status note so the 006 spec states that the role model is superseded by this feature's registry + assignments (constitution II: specs stay current)
- [X] T042 Re-run complete backend (`pytest`) and frontend (`vitest`) suites; confirm green; final review of constitution compliance (contract matches behavior, no undocumented payload dependencies, verification executed)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories. T002–T011 form one coherent layer: persistence (T002–T004), registry (T005–T009), schemas/primitives (T010–T011). T010 and T011 parallelize against T002–T009.
- **User Stories (Phase 3–7)**: Depend on Foundational completion.
- **Polish (Phase 8)**: Depends on all user stories complete.

### User Story Dependencies

- **US1 (P1)**: First after Foundational; delivers the assignment API surface everything else uses.
- **US2 (P1)**: After US1 (uses assignment endpoints to build recruiter+expert test fixtures); delivers landing + capability gating.
- **US3 (P1)**: After US1; frontend snapshot rendering can proceed in parallel with US2 backend by a second developer once T028's contract settles.
- **US4 (P1)**: After US2 (gating primitive is proven on a real route); removes the remaining hardcoded checks.
- **US5 (P2)**: After US4; pure verification + parity fixes.

### Within Each User Story

- Tests written first where listed (T012–T013, T019–T020, T026–T027, T032–T033, T036–T037) and failing before implementation.
- Backend before frontend consumption in every story.

### Parallel Opportunities

- After T001: T002 ∥ T004 ∥ T005 ∥ T006 ∥ T007 ∥ T010 ∥ T011 (different files; T003 depends on T002; T008 depends on T005–T007; T009 depends on T008).
- US1: T012 ∥ T013 ∥ T016; US3: T026 ∥ T027 ∥ T029; US4: T032 ∥ T033; US5: T036 ∥ T037.
- US3 frontend (T029–T031) ∥ US2 backend (T019–T022) once T028 lands.

---

## Parallel Example: Foundational + US1

```bash
# After T001, launch together:
Task: "Assignment model in backend/app/models/role_assignment.py (T002)"
Task: "Registry models in backend/app/roles/models.py (T005)"
Task: "Registry data in backend/app/roles/catalog.py (T006)"
Task: "Startup validation in backend/app/roles/validation.py (T007)"
Task: "RoleCode + roles schemas in backend/app/schemas/auth.py (T010)"
Task: "Capability dependencies in backend/app/dependencies/auth.py (T011)"

# Then:
Task: "Alembic migration role column -> assignments (T003)"
Task: "RoleService in backend/app/services/role_service.py (T008)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup + Phase 2 Foundational.
2. Phase 3 US1: multi-role assignment on one account works via API and admin UI.
3. Stop and validate: quickstart steps 4–5.

### Incremental Delivery

1. Setup + Foundational → assignments + registry live.
2. US1 → multi-role assignment (MVP).
3. US2 → one-session recruiter+expert with capability gating.
4. US3 → registry-only role addition, data-driven clients.
5. US4 → zero hardcoded access checks.
6. US5 → regression proven; guard rails verified.
7. Polish → quickstart validation recorded, 006 spec note updated.

### Parallel Team Strategy

- Developer A: Foundational persistence + US1 (T002–T018).
- Developer B: Registry package + US3 backend/frontend (T005–T009 partial, T026–T031).
- Developer C: US2 + US4 gating and landing (T019–T025, T032–T035).
- US5 and Polish run after merge.

---

## Notes

- One delivery: do not land a "multi-role with hardcoded checks" intermediate state; the capability primitive (T011) is available before any protected route is migrated.
- Built-in role definitions in `backend/app/roles/catalog.py` are the single place where pre-change behavior is encoded; US5 exists to prove parity.
- No new database tables beyond `internal_role_assignments`; if a task seems to require one, re-check against data-model.md.
- Commit after each task or logical group; keep contract and spec wording in sync with any deviation discovered during implementation.
- This feature directory is the merged single source of truth for the former 007 and 008 scopes; do not resurrect the 008 directory.
