---
description: "Task list for recruiter vacancy review workflow"
---

# Tasks: Recruiter Vacancy Review Workflow

**Input**: Design documents from `/specs/008-recruiter-vacancy-review/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The plan and quickstart explicitly require backend and frontend validation for lifecycle, permissions, conflicts, and shared workspace behavior.

**Organization**: Tasks are grouped by user story to keep each slice independently testable and shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]` to `[US4]`)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `backend/app/...`, tests in `backend/tests/...`
- Frontend: `frontend/app/...`, `frontend/components/...`, `frontend/lib/...`, `frontend/styles/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline behavior and create the feature task baseline.

- [X] T001 Verify the current baseline from `specs/008-recruiter-vacancy-review/quickstart.md` by running existing backend and frontend suites against `backend/tests/` and `frontend/` so later regressions are attributable to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared persistence, contracts, permissions, and UI plumbing required by every user story.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T002 [P] Create the vacancy persistence models in `backend/app/models/vacancy.py`, `backend/app/models/vacancy_question.py`, and `backend/app/models/vacancy_review_decision.py` per `specs/008-recruiter-vacancy-review/data-model.md`
- [X] T003 Create the vacancy Alembic migration in `backend/app/migrations/versions/` for vacancy, question, and review decision tables plus archive/status support fields defined in `specs/008-recruiter-vacancy-review/data-model.md`
- [X] T004 [P] Implement vacancy data access in `backend/app/repositories/vacancy_repository.py` for list/detail reads, question ordering, review decision storage, and stale-write checks by `expected_updated_at`
- [X] T005 [P] Add vacancy schemas in `backend/app/schemas/vacancies.py` matching `specs/008-recruiter-vacancy-review/contracts/vacancy-review.openapi.yaml`, including detail, summary, review state, question payloads, and viewer permissions
- [X] T006 [P] Extend capability definitions in `backend/app/roles/catalog.py` for recruiter vacancy actions and expert review actions used by this feature
- [X] T007 [P] Add reusable vacancy access helpers in `backend/app/dependencies/auth.py` or a dedicated vacancy access dependency module for capability checks plus direct/inherited recruiter ownership-chain resolution
- [X] T008 [P] Add vacancy API client types and request helpers in `frontend/lib/api.ts` for recruiter vacancy routes, expert vacancy routes, question mutations, review decisions, and conflict errors
- [X] T009 [P] Add vacancy UI helper utilities in `frontend/lib/vacancies.ts` for status labels, viewer permission checks, and summary formatting used across recruiter and expert pages

**Checkpoint**: Shared vacancy entities, contract shapes, access primitives, and frontend clients are ready.

---

## Phase 3: User Story 1 - Recruiter authors a vacancy draft and question pack (Priority: P1) 🎯 MVP

**Goal**: Recruiters can create, open, and edit directly owned or inherited-access vacancies as drafts, including question authoring and full recruiter control through the managing recruiter ownership chain.

**Independent Test**: Create a vacancy as a recruiter, reopen and edit it, create another vacancy as a managed internal user, confirm the managing recruiter can fully control it, and verify unrelated recruiters are denied.

### Tests for User Story 1

- [X] T010 [P] [US1] Add recruiter vacancy API tests in `backend/tests/api/test_vacancies_api.py` for create, list, detail, direct ownership access, inherited managing-recruiter access, and unrelated recruiter denial
- [X] T011 [P] [US1] Add service tests in `backend/tests/services/test_vacancy_workflow.py` for managing recruiter resolution, direct creator preservation, question ordering, and draft save behavior
- [X] T012 [P] [US1] Add recruiter vacancy UI tests in `frontend/app/internal/recruiter/vacancies/page.test.tsx` and `frontend/components/vacancies/vacancy-workspace.test.tsx` for draft creation, draft editing, and inherited-access visibility

### Implementation for User Story 1

- [X] T013 [US1] Implement recruiter vacancy create/list/detail/update behavior in `backend/app/services/vacancy_service.py` with direct creator, managing recruiter, draft persistence, and direct-plus-inherited recruiter authorization
- [X] T014 [US1] Implement recruiter vacancy routes in `backend/app/routers/vacancies.py` for `GET /api/v1/vacancies`, `POST /api/v1/vacancies`, and `GET/PATCH /api/v1/vacancies/{vacancy_id}`
- [X] T015 [US1] Implement recruiter question create, update, reorder, and delete flows in `backend/app/services/vacancy_service.py` and `backend/app/routers/vacancies.py`
- [X] T016 [US1] Wire the new vacancy routers into `backend/app/main.py` and export any needed models in `backend/app/models/__init__.py` or equivalent registry files already used by the backend
- [X] T017 [P] [US1] Create the recruiter vacancy list page in `frontend/app/internal/recruiter/vacancies/page.tsx` and the shared list component in `frontend/components/vacancies/vacancy-list.tsx`
- [X] T018 [P] [US1] Create the shared vacancy detail route in `frontend/app/internal/vacancies/[vacancyId]/page.tsx` and the shared workspace container in `frontend/components/vacancies/vacancy-workspace.tsx`
- [X] T019 [P] [US1] Build editable recruiter form sections in `frontend/components/vacancies/vacancy-form-sections.tsx` and question editing UI in `frontend/components/vacancies/vacancy-question-list.tsx`
- [X] T020 [US1] Replace the recruiter vacancies placeholder in `frontend/components/auth/recruiter-workspace.tsx` so the Vacancies tab links to `frontend/app/internal/recruiter/vacancies/page.tsx` instead of placeholder content
- [X] T021 [US1] Add recruiter draft workspace styles and responsive states in `frontend/styles/app.css` using existing tokens and component patterns from `frontend/styles/design-system.md`

**Checkpoint**: Recruiter draft authoring works end-to-end and is the MVP slice.

---

## Phase 4: User Story 2 - Recruiter submits a vacancy for expert review (Priority: P1)

**Goal**: Recruiters can submit eligible vacancies for review without strict completeness blocking, and the UI clearly reflects submission state.

**Independent Test**: Submit a vacancy with incomplete optional metadata, confirm status changes to `submitted_for_review`, submitted timestamp appears, and the recruiter sees the correct post-submit read/edit behavior.

### Tests for User Story 2

- [X] T022 [P] [US2] Add submit-for-review API tests in `backend/tests/api/test_vacancies_api.py` for `draft` and `changes_requested` submission, permissive submission with missing optional content, and invalid-state rejection
- [X] T023 [P] [US2] Add recruiter submission UI tests in `frontend/components/vacancies/vacancy-workspace.test.tsx` for submit button visibility, successful submit state, and invalid-state messaging

### Implementation for User Story 2

- [X] T024 [US2] Implement submit-for-review lifecycle logic and submitted timestamp handling in `backend/app/services/vacancy_service.py`
- [X] T025 [US2] Add `POST /api/v1/vacancies/{vacancy_id}/submit-for-review` to `backend/app/routers/vacancies.py` and ensure the detail response includes updated review state and viewer permissions
- [X] T026 [US2] Add shared review-state rendering in `frontend/components/vacancies/review-state-panel.tsx` for status, submitted timestamp, latest review outcome, and recruiter submission action
- [X] T027 [US2] Integrate recruiter submit behavior into `frontend/components/vacancies/vacancy-workspace.tsx` and `frontend/app/internal/recruiter/vacancies/page.tsx`, including optimistic disable/loading feedback and post-submit refresh

**Checkpoint**: Recruiters can hand vacancies off to expert review without completeness blockers.

---

## Phase 5: User Story 3 - Expert reviews and decides on the assessment pack (Priority: P1)

**Goal**: Experts can work from a dedicated review queue, open the same vacancy workspace, edit only the interview pack, and approve or request changes.

**Independent Test**: Open a submitted vacancy as an expert, confirm body fields are read-only, update question content, request changes with an empty comment, approve another vacancy, and confirm approved or archived vacancies are not editable by experts.

### Tests for User Story 3

- [X] T028 [P] [US3] Add expert review API tests in `backend/tests/api/test_expert_vacancies_api.py` for queue listing, detail access, question-only edit permissions, approval, change requests, empty comments, and approved/archived edit denial
- [X] T029 [P] [US3] Add review decision service tests in `backend/tests/services/test_vacancy_workflow.py` for latest review state, review history persistence, and expert-only transitions
- [X] T030 [P] [US3] Add expert queue and shared workspace UI tests in `frontend/app/internal/expert/vacancies/page.test.tsx` and `frontend/components/vacancies/vacancy-workspace.test.tsx` for expert read-only body fields, question editing, approve, and request-changes states

### Implementation for User Story 3

- [X] T031 [US3] Implement expert review lifecycle, question-pack edit restrictions, and review decision recording in `backend/app/services/vacancy_review_service.py`
- [X] T032 [US3] Implement expert vacancy routes in `backend/app/routers/expert_vacancies.py` for queue, detail, question patch, approve, and request-changes endpoints
- [X] T033 [US3] Extend `backend/app/services/vacancy_service.py` or shared serializers to build the common vacancy detail shape with expert-specific `viewer_permissions`
- [X] T034 [P] [US3] Create the expert review queue page in `frontend/app/internal/expert/vacancies/page.tsx` and update `frontend/components/auth/expert-workspace.tsx` to link to the queue instead of the placeholder question form
- [X] T035 [US3] Integrate expert-mode controls into `frontend/components/vacancies/vacancy-workspace.tsx`, `frontend/components/vacancies/vacancy-question-list.tsx`, and `frontend/components/vacancies/review-state-panel.tsx`
- [X] T036 [US3] Add expert review and queue styles in `frontend/styles/app.css` using the existing neutral workspace system and status patterns

**Checkpoint**: Expert review works end-to-end on the shared vacancy route with backend-authoritative permissions.

---

## Phase 6: User Story 4 - Recruiter revises approved or returned vacancies and manages archive state (Priority: P2)

**Goal**: Recruiters can revise returned vacancies, approved vacancies automatically reset to draft on significant changes, archived vacancies can be restored, and stale concurrent writes are rejected cleanly.

**Independent Test**: Edit a `changes_requested` vacancy to return it to `draft`, make significant changes to an approved vacancy and confirm reset, archive and restore it, then verify stale writes return conflicts instead of overwriting newer changes.

### Tests for User Story 4

- [X] T037 [P] [US4] Add lifecycle and reset API tests in `backend/tests/api/test_vacancies_api.py` for `changes_requested -> draft`, approved-to-draft reset on all significant field categories, archive, restore, and stale-write `409` conflicts
- [X] T038 [P] [US4] Add reset and archive service tests in `backend/tests/services/test_vacancy_workflow.py` for approval clearing, review history preservation, restore target state, and no-partial-apply conflict handling
- [X] T039 [P] [US4] Add workspace UI tests in `frontend/components/vacancies/vacancy-workspace.test.tsx` for conflict messaging, read-only archived state, restore flow, and review-state updates after reset

### Implementation for User Story 4

- [X] T040 [US4] Implement significant-change detection, approved-to-draft reset, archive, restore, and stale-write conflict handling in `backend/app/services/vacancy_service.py`
- [X] T041 [US4] Add `POST /api/v1/vacancies/{vacancy_id}/archive` and `POST /api/v1/vacancies/{vacancy_id}/restore` to `backend/app/routers/vacancies.py` and ensure detail responses keep review history and viewer permissions consistent
- [X] T042 [US4] Update `frontend/components/vacancies/vacancy-workspace.tsx` and `frontend/components/vacancies/review-state-panel.tsx` for archive, restore, approved-reset messaging, and conflict recovery UI
- [X] T043 [US4] Update recruiter and expert lists in `frontend/components/vacancies/vacancy-list.tsx`, `frontend/app/internal/recruiter/vacancies/page.tsx`, and `frontend/app/internal/expert/vacancies/page.tsx` for archived sorting, latest review summaries, and refresh after lifecycle changes

**Checkpoint**: Lifecycle completion, approval protection, archive/restore, and conflict handling are fully functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation alignment, and cross-story cleanup.

- [X] T044 [P] Add contract-alignment checks by updating `backend/tests/api/test_vacancies_api.py` and `backend/tests/api/test_expert_vacancies_api.py` so the implemented responses match `specs/008-recruiter-vacancy-review/contracts/vacancy-review.openapi.yaml`
- [X] T045 [P] Update `specs/008-recruiter-vacancy-review/contracts/shared-vacancy-workspace.md` and `specs/008-recruiter-vacancy-review/quickstart.md` if implementation details uncover necessary wording adjustments for inherited recruiter control or viewer permissions
- [X] T046 Run the full validation sequence from `specs/008-recruiter-vacancy-review/quickstart.md` and record the outcome in `specs/008-recruiter-vacancy-review/spec.md` and `specs/008-recruiter-vacancy-review/tasks.md` progress notes if any step is blocked

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational; establishes the core vacancy domain and recruiter workflow MVP.
- **US2 (Phase 4)**: Depends on US1 because submission requires working recruiter vacancy authoring.
- **US3 (Phase 5)**: Depends on US2 because expert review requires submitted vacancies and shared detail serialization.
- **US4 (Phase 6)**: Depends on US3 because archive/restore and approval reset build on the implemented review lifecycle.
- **Polish (Phase 7)**: Depends on all user story phases.

### User Story Dependencies

- **US1**: No dependency on other stories after Foundational.
- **US2**: Requires US1 vacancy creation/editing.
- **US3**: Requires US2 submission flow and shared workspace.
- **US4**: Requires US3 approval/change-request behavior.

### Within Each User Story

- Tests should be written first and fail before implementation.
- Backend service and router work should land before frontend consumers for the same story.
- Shared workspace UI should be wired after the relevant backend detail response shape is stable.

### Parallel Opportunities

- Foundational: T002, T004, T005, T006, T007, T008, and T009 can run in parallel; T003 depends on T002.
- US1: T010, T011, and T012 can run in parallel; T017, T018, and T019 can run in parallel after T008 and T009.
- US2: T022 and T023 can run in parallel.
- US3: T028, T029, and T030 can run in parallel; T034 and T035 can proceed in parallel once T032 and T033 stabilize the backend shape.
- US4: T037, T038, and T039 can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Write recruiter authoring tests together:
Task: "Add recruiter vacancy API tests in backend/tests/api/test_vacancies_api.py"
Task: "Add service tests in backend/tests/services/test_vacancy_workflow.py"
Task: "Add recruiter vacancy UI tests in frontend/app/internal/recruiter/vacancies/page.test.tsx and frontend/components/vacancies/vacancy-workspace.test.tsx"

# Then build the recruiter UI in parallel once backend shapes exist:
Task: "Create recruiter vacancy list page in frontend/app/internal/recruiter/vacancies/page.tsx"
Task: "Create shared vacancy detail route in frontend/app/internal/vacancies/[vacancyId]/page.tsx"
Task: "Build editable recruiter form sections in frontend/components/vacancies/vacancy-form-sections.tsx and frontend/components/vacancies/vacancy-question-list.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: US1 recruiter draft authoring and inherited recruiter control.
4. Stop and validate US1 independently.

### Incremental Delivery

1. Setup + Foundational.
2. US1: recruiter draft workflow.
3. US2: submission for review.
4. US3: expert review and decision flow.
5. US4: approved reset, archive/restore, and conflict handling.
6. Polish: full quickstart validation and contract cleanup.

### Parallel Team Strategy

- Developer A: backend domain and recruiter APIs in `backend/app/models/`, `backend/app/repositories/`, `backend/app/services/vacancy_service.py`, and `backend/app/routers/vacancies.py`
- Developer B: expert review backend in `backend/app/services/vacancy_review_service.py` and `backend/app/routers/expert_vacancies.py`
- Developer C: recruiter and expert frontend surfaces in `frontend/app/internal/**`, `frontend/components/vacancies/`, and `frontend/lib/`

---

## Notes

- All tasks follow the required checklist format with task ID, optional parallel marker, story label when applicable, and exact file paths.
- The managing recruiter ownership chain is part of the core authorization model and must be covered in API, service, and UI tests.
- Keep backend permission enforcement authoritative even when the shared workspace hides unavailable controls.
- Reuse existing `frontend/styles/app.css` patterns and semantic tokens rather than inventing a new vacancy-specific visual system.
