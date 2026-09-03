---

description: "Task list for Docker Dev Baseline implementation"
---

# Tasks: Docker Dev Baseline

**Input**: Design documents from `/specs/002-docker-dev-baseline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No TDD-first task set requested. This task list includes verification and smoke-check tasks needed to prove each story independently.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare baseline feature entrypoints and shared ignore/documentation scaffolding

- [X] T001 Create dedicated root baseline compose entrypoint in `docker-compose.dev.yml`
- [X] T002 [P] Add or update root `.gitignore` entries for service-local `.env` files in `.gitignore`
- [X] T003 [P] Add Docker build context exclusions for frontend in `frontend/.dockerignore`
- [X] T004 [P] Add Docker build context exclusions for backend in `backend/.dockerignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared Docker and configuration foundation required before any story is independently complete

**⚠️ CRITICAL**: No user story should be considered done until this phase is complete

- [X] T005 Update baseline orchestration wiring for core services only in `docker-compose.dev.yml`
- [X] T006 [P] Normalize frontend service build/runtime configuration in `frontend/Dockerfile`
- [X] T007 [P] Normalize backend service build/runtime configuration in `backend/Dockerfile`
- [X] T008 [P] Move frontend runtime defaults to env-file driven compose configuration in `frontend/docker-compose.yml`
- [X] T009 [P] Make backend compose configuration explicitly consume service-local env file in `backend/docker-compose.yml`
- [X] T010 [P] Create local frontend environment file template in `frontend/.env`
- [X] T011 [P] Create local backend environment file template in `backend/.env`
- [X] T012 Ensure frontend dependency manifests remain authoritative for image builds in `frontend/package.json` and `frontend/package-lock.json`
- [X] T013 Ensure backend dependency manifests remain authoritative for image builds in `backend/pyproject.toml` and `backend/uv.lock`

**Checkpoint**: Foundation ready for independently testable user-story delivery

---

## Phase 3: User Story 1 - Start core app locally (Priority: P1) 🎯 MVP

**Goal**: Give developers one working Docker happy path that starts only frontend and backend from the repository root.

**Independent Test**: From the repository root, run `docker compose -f docker-compose.dev.yml up --build` and confirm both core services stay up while `live-agent` and `evaluation-agent` are not required.

### Implementation for User Story 1

- [X] T014 [US1] Implement root baseline compose flow for `frontend` and `backend` in `docker-compose.dev.yml`
- [X] T015 [US1] Update repository-level startup guidance for the baseline in `README.md`
- [X] T016 [US1] Update frontend Docker run guidance to align with the root baseline flow in `frontend/README.md`
- [X] T017 [US1] Update backend Docker run guidance to align with the root baseline flow in `backend/README.md`
- [X] T018 [US1] Document how the root baseline differs from the broader multi-service compose flow in `README.md`

**Checkpoint**: User Story 1 should provide a single reproducible core-service startup path

---

## Phase 4: User Story 2 - Use frontend against local backend by default (Priority: P2)

**Goal**: Ensure the frontend uses the local backend by default through configuration owned outside source code.

**Independent Test**: Start the baseline, open `http://localhost:3000`, call `http://localhost:8000/health`, and confirm the frontend/backend wiring uses environment-owned values rather than hardcoded source changes.

### Implementation for User Story 2

- [X] T019 [US2] Add frontend runtime env-file loading for backend base URL in `frontend/docker-compose.yml`
- [X] T020 [US2] Update frontend app code to read the backend base URL from owned configuration in `frontend/app/page.tsx`
- [X] T021 [P] [US2] Update candidate flow to reference the same backend configuration source in `frontend/app/interview/[token]/page.tsx`
- [X] T022 [US2] Update backend CORS/configuration defaults to align with the baseline frontend URL in `backend/app/config.py`
- [X] T023 [US2] Preserve backend startup wiring against the documented health contract in `backend/app/main.py` and `backend/app/routers/health.py`
- [X] T024 [US2] Document frontend-to-backend env ownership and failure diagnosis in `specs/002-docker-dev-baseline/contracts/frontend-backend-baseline.md`

**Checkpoint**: User Story 2 should make frontend-to-backend wiring configurable and visible without source edits for each run

---

## Phase 5: User Story 3 - Keep local configuration out of code (Priority: P3)

**Goal**: Keep mutable local settings and dependency-tooling expectations inside each project so the same artifacts work locally and in CI.

**Independent Test**: Build `./frontend` and `./backend` images independently, recreate `frontend/.env` and `backend/.env` from project-owned templates, and confirm no extra host-side dependency setup is required beyond Docker.

### Implementation for User Story 3

- [X] T025 [US3] Create or update frontend local environment template in `frontend/.env.example`
- [X] T026 [US3] Create or update backend local environment template in `backend/.env.example`
- [X] T027 [P] [US3] Ensure frontend image build installs all required project-owned dependencies in `frontend/Dockerfile`
- [X] T028 [P] [US3] Ensure backend image build installs all required project-owned dependencies in `backend/Dockerfile`
- [X] T029 [US3] Document service-local dependency and package-manager ownership in `frontend/README.md`
- [X] T030 [US3] Document service-local dependency and package-manager ownership in `backend/README.md`
- [X] T031 [US3] Document CI and separate-hosting reuse expectations for both core artifacts in `README.md`

**Checkpoint**: User Story 3 should make service-local env and dependency ownership explicit and reusable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and consistency updates spanning multiple user stories

- [X] T032 [P] Align quickstart validation steps with the implemented baseline commands in `specs/002-docker-dev-baseline/quickstart.md`
- [X] T033 [P] Align design artifacts with any implementation-level path or command refinements in `specs/002-docker-dev-baseline/plan.md`, `specs/002-docker-dev-baseline/research.md`, and `specs/002-docker-dev-baseline/data-model.md`
- [X] T034 Run backend verification command against the baseline changes in `backend/tests/test_health.py`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies, can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion and is the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational completion; can proceed after US1 if a single-stream implementation is preferred
- **User Story 3 (Phase 5)**: Depends on Foundational completion; can proceed after US1 if a single-stream implementation is preferred
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1**: No dependency on other user stories once Phase 2 is complete
- **US2**: Uses the baseline created in US1 for verification, but its implementation remains independently scoped to FE-to-BE wiring
- **US3**: Shares the baseline foundation, but remains independently scoped to env and dependency ownership

### Parallel Opportunities

- `T002`, `T003`, and `T004` can run in parallel during setup
- `T006`, `T007`, `T008`, `T009`, `T010`, and `T011` can run in parallel during foundational work
- `T020` and `T021` can run in parallel within US2 after env ownership is defined
- `T027` and `T028` can run in parallel within US3
- `T032` and `T033` can run in parallel during polish

---

## Parallel Example: User Story 2

```bash
Task: "Update frontend app code to read the backend base URL from owned configuration in frontend/app/page.tsx"
Task: "Update candidate flow to reference the same backend configuration source in frontend/app/interview/[token]/page.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "Ensure frontend image build installs all required project-owned dependencies in frontend/Dockerfile"
Task: "Ensure backend image build installs all required project-owned dependencies in backend/Dockerfile"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate the dedicated root baseline startup flow

### Incremental Delivery

1. Finish Setup + Foundational
2. Deliver US1 for reproducible core-service startup
3. Deliver US2 for frontend-to-backend env-driven wiring
4. Deliver US3 for service-local env/dependency ownership and CI reuse expectations
5. Finish with cross-cutting validation and documentation alignment

### Suggested MVP Scope

- Phase 1
- Phase 2
- Phase 3 (US1)

---

## Notes

- All tasks follow the required checkbox + task ID + optional `[P]` + optional `[US#]` + exact file path format
- Tasks are grouped by user story for traceability and independent validation
- Verification is included where required by the feature quickstart and constitution
- Avoid expanding scope into `live-agent/`, `evaluation-agent/`, or non-baseline infrastructure work
