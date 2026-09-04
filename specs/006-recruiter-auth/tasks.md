---

description: "Task list for feature implementation"
---

# Tasks: MVP Multi-Role Auth for Internal Access

**Input**: Design documents from `/specs/006-recruiter-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are explicitly required by the user. Backend and frontend tasks include unit, integration, and page/component coverage for each user story.

**Organization**: Tasks are grouped by user story to preserve vertical slices while following the modular monolith architecture, contract-first FE/BE boundary, and existing frontend design system.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add auth and validation dependencies in `backend/pyproject.toml`
- [X] T002 [P] Extend auth/database runtime settings in `backend/app/config.py` and `backend/.env.example`
- [X] T003 [P] Create thin frontend API and session helpers in `frontend/lib/api.ts` and `frontend/lib/auth.ts`
- [X] T004 [P] Extend shared auth and workspace styles in `frontend/styles/app.css` using existing semantic tokens only
- [X] T005 [P] Create or verify Docker ignore coverage for frontend/backend builds in `.dockerignore`

**Checkpoint**: setup, configuration, and shared UI primitives are ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Create async database engine, session factory, and session dependency in `backend/app/db.py`
- [X] T007 [P] Create internal user ORM model and role enum mapping in `backend/app/models/user.py`
- [X] T008 [P] Create auth and internal-user schemas in `backend/app/schemas/auth.py`
- [X] T009 [P] Create user repository abstraction in `backend/app/repositories/user_repository.py`
- [X] T010 [P] Create FastAPI dependency modules for current user and recruiter role checks in `backend/app/dependencies/auth.py`
- [X] T011 Create auth service for password hashing, token issuing, and current-user resolution in `backend/app/services/auth_service.py`
- [X] T012 Create recruiter-only internal-user admin service in `backend/app/services/user_admin_service.py`
- [X] T013 Initialize Alembic config and first auth migration in `backend/alembic.ini`, `backend/app/migrations/env.py`, and `backend/app/migrations/versions/`
- [X] T014 Create backend shared-layer tests in `backend/tests/conftest.py`, `backend/tests/test_user_repository.py`, and `backend/tests/test_auth_service.py`
- [X] T015 Create frontend shared helper tests and cleanup hooks in `frontend/lib/auth.test.ts` and `frontend/vitest.setup.ts`
- [X] T016 Register auth router and application lifespan wiring in `backend/app/routers/auth.py`, `backend/app/routers/__init__.py`, and `backend/app/main.py`

**Checkpoint**: foundation is in place for auth, persistence, DI, migrations, and shared tests.

---

## Phase 3: User Story 1 - Рекрутёр создаёт первый аккаунт и входит в систему (Priority: P1) 🎯 MVP

**Goal**: recruiter can self-register and land in a protected internal area without manual DB setup.

**Independent Test**: open `/register`, submit valid recruiter data, and verify redirect into the protected recruiter area with an active session.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T017 [P] [US1] Add backend API tests for `POST /api/v1/auth/register` in `backend/tests/test_auth_api.py`
- [X] T018 [P] [US1] Add frontend registration page tests in `frontend/app/register/page.test.tsx`
- [X] T019 [P] [US1] Add root redirect tests for unauthenticated users in `frontend/app/page.test.tsx`

### Implementation for User Story 1

- [X] T020 [US1] Implement recruiter self-signup logic in `backend/app/services/auth_service.py`
- [X] T021 [US1] Implement `POST /api/v1/auth/register` endpoint in `backend/app/routers/auth.py`
- [X] T022 [US1] Implement recruiter registration page in `frontend/app/register/page.tsx`
- [X] T023 [US1] Implement client-side session persistence and post-signup navigation in `frontend/lib/auth.ts`
- [X] T024 [US1] Implement root entry redirect behavior in `frontend/app/page.tsx`

**Checkpoint**: recruiter self-signup works end-to-end and can be demoed independently.

---

## Phase 4: User Story 2 - Рекрутёр создаёт аккаунты для других внутренних ролей (Priority: P1)

**Goal**: authenticated recruiter can create `hiring_manager` and `expert` accounts with temporary passwords.

**Independent Test**: sign in as recruiter, create one `hiring_manager` and one `expert`, and confirm duplicate-email creation is rejected.

### Tests for User Story 2 ⚠️

- [X] T025 [P] [US2] Add backend API tests for `POST /api/v1/internal-users` in `backend/tests/test_auth_api.py`
- [X] T026 [P] [US2] Add backend service tests for recruiter-created accounts in `backend/tests/test_auth_service.py`
- [X] T027 [P] [US2] Add recruiter account-creation UI tests in `frontend/app/internal/recruiter/page.test.tsx`

### Implementation for User Story 2

- [X] T028 [US2] Implement recruiter-only internal account creation rules in `backend/app/services/user_admin_service.py`
- [X] T029 [US2] Implement `POST /api/v1/internal-users` endpoint in `backend/app/routers/auth.py`
- [X] T030 [US2] Apply recruiter-only dependency enforcement in `backend/app/dependencies/auth.py` and `backend/app/routers/auth.py`
- [X] T031 [US2] Create reusable internal-user creation form in `frontend/components/auth/internal-user-form.tsx`
- [X] T032 [US2] Extend recruiter workspace integration hooks for account creation in `frontend/lib/api.ts` and `frontend/lib/auth.ts`

**Checkpoint**: recruiter can create internal accounts independently of the later workspace-navigation story.

---

## Phase 5: User Story 3 - Внутренний пользователь входит в существующий аккаунт по своей роли (Priority: P1)

**Goal**: recruiter, hiring manager, and expert can sign in and reach their role-specific protected areas.

**Independent Test**: sign in as each role and verify the app resolves role-aware protected navigation and role-specific landing content.

### Tests for User Story 3 ⚠️

- [X] T033 [P] [US3] Add backend API tests for `POST /api/v1/auth/login` and `GET /api/v1/auth/me` in `backend/tests/test_auth_api.py`
- [X] T034 [P] [US3] Add frontend login flow tests in `frontend/app/login/page.test.tsx`
- [X] T035 [P] [US3] Add frontend role-area tests in `frontend/app/internal/hiring-manager/page.test.tsx`, `frontend/app/internal/expert/page.test.tsx`, and `frontend/app/internal/page.test.tsx`

### Implementation for User Story 3

- [X] T036 [US3] Implement sign-in and current-user lookup use cases in `backend/app/services/auth_service.py`
- [X] T037 [US3] Implement `POST /api/v1/auth/login` and `GET /api/v1/auth/me` endpoints in `backend/app/routers/auth.py`
- [X] T038 [US3] Implement role-aware landing payload generation in `backend/app/services/user_admin_service.py`
- [X] T039 [US3] Implement `GET /api/v1/internal-users/me/landing` endpoint in `backend/app/routers/auth.py`
- [X] T040 [US3] Implement login page in `frontend/app/login/page.tsx`
- [X] T041 [US3] Implement protected role-page shell in `frontend/components/auth/protected-role-page.tsx` and `frontend/components/auth/role-area.tsx`
- [X] T042 [US3] Implement role-specific placeholder pages in `frontend/app/internal/hiring-manager/page.tsx`, `frontend/app/internal/expert/page.tsx`, and `frontend/app/internal/page.tsx`

**Checkpoint**: all internal roles can sign in and reach protected role-specific areas.

---

## Phase 6: User Story 4 - Приватные внутренние функции защищены, а кандидатский доступ остаётся отдельным (Priority: P1)

**Goal**: protected internal routes require a valid internal session, recruiter-only actions reject non-recruiters, and candidate token routes stay independent from internal auth.

**Independent Test**: hit internal routes without a token and confirm redirect, call recruiter-only account creation as `hiring_manager` and confirm `403`, then open `/interview/[token]` without internal login and confirm no auth redirect.

### Tests for User Story 4 ⚠️

- [X] T043 [P] [US4] Add backend authorization boundary tests in `backend/tests/test_auth_api.py`
- [X] T044 [P] [US4] Add frontend protected-route redirect tests in `frontend/app/internal/page.test.tsx`
- [X] T045 [P] [US4] Add candidate-route non-interference tests in `frontend/app/interview/[token]/page.test.tsx`

### Implementation for User Story 4

- [X] T046 [US4] Finalize invalid-session and non-recruiter access handling in `backend/app/dependencies/auth.py` and `backend/app/routers/auth.py`
- [X] T047 [US4] Finalize protected-session helpers in `frontend/lib/auth.ts`
- [X] T048 [US4] Apply protected access checks across internal routes in `frontend/app/internal/page.tsx`, `frontend/app/internal/recruiter/page.tsx`, `frontend/app/internal/hiring-manager/page.tsx`, and `frontend/app/internal/expert/page.tsx`
- [X] T049 [US4] Preserve candidate-route independence in `frontend/app/interview/[token]/page.tsx`

**Checkpoint**: access boundaries are enforced without affecting candidate token flow.

---

## Phase 7: User Story 5 - Рекрутёр видит организованные вкладки в своей рабочей зоне (Priority: P2)

**Goal**: recruiter workspace is organized by tabs, with a working `Users` tab and visible placeholder tabs for `Vacancies` and `Candidates`.

**Independent Test**: sign in as recruiter, verify `Users` is active by default and shows only the internal users created by that recruiter plus add-user action, then switch to `Vacancies` and `Candidates` and confirm each shows an explicit placeholder state.

### Tests for User Story 5 ⚠️

- [X] T050 [P] [US5] Add backend API tests for recruiter-scoped `GET /api/v1/internal-users` in `backend/tests/test_auth_api.py`
- [X] T051 [P] [US5] Add recruiter tabbed-workspace tests in `frontend/app/internal/recruiter/page.test.tsx`
- [X] T052 [P] [US5] Add frontend helper/component tests for recruiter workspace tab behavior in `frontend/components/auth/recruiter-workspace.test.tsx` (skipped as separate file; covered by `frontend/app/internal/recruiter/page.test.tsx`)

### Implementation for User Story 5

- [X] T053 [US5] Extend repository list queries for recruiter-scoped internal users in `backend/app/repositories/user_repository.py`
- [X] T054 [US5] Extend recruiter admin service with recruiter-scoped internal-user listing in `backend/app/services/user_admin_service.py`
- [X] T055 [US5] Add recruiter-scoped internal-user list schema and `GET /api/v1/internal-users` endpoint in `backend/app/schemas/auth.py` and `backend/app/routers/auth.py`
- [X] T056 [US5] Implement recruiter tabbed workspace UI in `frontend/components/auth/recruiter-workspace.tsx`
- [X] T057 [US5] Replace single recruiter screen with tabbed recruiter workspace in `frontend/app/internal/recruiter/page.tsx`
- [X] T058 [US5] Improve recruiter workspace and button visibility styles in `frontend/styles/app.css`
- [X] T059 [US5] Refine recruiter workspace links and action affordances in `frontend/components/auth/role-area.tsx`

**Checkpoint**: recruiter workspace navigation is properly organized without expanding non-recruiter scopes.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T060 [P] Update auth/backend run instructions in `backend/README.md`
- [X] T061 [P] Update auth/frontend UX and route status in `frontend/README.md`
- [X] T062 [P] Update implemented/sync status in `specs/006-recruiter-auth/spec.md` and `specs/006-recruiter-auth/plan.md`
- [X] T063 [P] Update API contract and quickstart for recruiter tabs and internal-user listing in `specs/006-recruiter-auth/contracts/api.md` and `specs/006-recruiter-auth/quickstart.md`
- [X] T064 Run full validation from `specs/006-recruiter-auth/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup and blocks all user stories
- **User Stories (Phase 3-7)**: all depend on Foundational; then proceed in priority order with explicit reuse of earlier auth flows
- **Polish (Phase 8)**: depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: starts after Foundational and provides the first shippable auth increment
- **User Story 2 (P1)**: depends on recruiter authentication from US1
- **User Story 3 (P1)**: depends on account existence from US1 and US2
- **User Story 4 (P1)**: depends on auth/session behavior from US1-US3
- **User Story 5 (P2)**: depends on recruiter sign-in and account-management behavior from US1-US4

### Within Each User Story

- write tests first and confirm they fail
- repositories before services when persistence behavior changes
- services before HTTP endpoints
- backend contract surface before frontend integration for the same story
- finish the story and validate its independent test before moving on

### Parallel Opportunities

- `T002`, `T003`, `T004`, and `T005` can run in parallel
- `T007`, `T008`, `T009`, and `T010` can run in parallel
- within each story, backend and frontend tests can be authored in parallel
- `US5` allows backend internal-user list work and frontend tabbed workspace work to proceed in parallel once the contract is fixed

---

## Parallel Example: User Story 5

```bash
Task: "Add backend API tests for GET /api/v1/internal-users in backend/tests/test_auth_api.py"
Task: "Add recruiter tabbed-workspace tests in frontend/app/internal/recruiter/page.test.tsx"

Task: "Extend repository list queries for internal users in backend/app/repositories/user_repository.py"
Task: "Implement recruiter tabbed workspace UI in frontend/components/auth/recruiter-workspace.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and validate recruiter self-signup independently

### Incremental Delivery

1. Setup + Foundational
2. US1: recruiter self-signup
3. US2: recruiter-created internal accounts
4. US3: multi-role sign-in and role-specific areas
5. US4: protected access boundaries and candidate-route separation
6. US5: recruiter tabbed workspace and user-list UX
7. Polish and quickstart validation

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Then split per story by layer-safe files:
   - Developer A: backend repositories/services/endpoints
   - Developer B: frontend pages/components/styles
   - Developer C: tests and quickstart validation

---

## Notes

- All tasks follow the required checklist format with IDs, optional `[P]`, story labels, and exact file paths.
- `US5` is intentionally recruiter-only and must not silently expand tabbed navigation to hiring-manager or expert areas.
- Frontend tasks must continue to reuse `frontend/styles/tokens.css`, `frontend/styles/app.css`, and `frontend/styles/design-system.md` rather than introducing a competing UI system.
