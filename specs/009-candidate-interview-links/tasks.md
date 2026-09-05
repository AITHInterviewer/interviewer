---
description: "Task list for feature 009 candidate interview links"
---

# Tasks: Candidate Interview Links

**Input**: Design documents from `/specs/009-candidate-interview-links/` (plan.md, spec.md, research.md, data-model.md, contracts/interview-links-api.md, quickstart.md)

**Tests**: Backend pytest tasks are included (API + service rules). Frontend tests are explicitly NOT generated per user instruction; FE verification is manual via quickstart.md scenarios.

**Organization**: Tasks are grouped by user story. US4 (vacancy time limit) is P2 in spec.md but sequenced before US1 because link creation is refused without the limit (spec US1 scenario 4) — it is a small blocking slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to spec.md user story (US1–US4)
- Exact file paths included; behaviors reference `contracts/interview-links-api.md` and `data-model.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm dev environment is ready; no new dependencies to install (per research.md R6/R7)

- [X] T001 Verify backend dev environment: `cd backend && uv sync` succeeds and `uv run uvicorn app.main:app --reload` boots (health endpoint responds)
- [X] T002 [P] Verify frontend dev environment: `cd frontend && npm install` succeeds and `npm run dev` boots; `npm run build` passes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, schemas, repository, service core, and dependency wiring shared by ALL user stories. No user story work can begin until this phase completes.

- [X] T003 Create `InterviewLink` model in `backend/app/models/interview_link.py` per data-model.md (fields: id, vacancy_id FK CASCADE, unique token String(64), candidate_first_name/last_name String(120), candidate_social String(300), candidate_email String(320) nullable, expires_at/started_at/completed_at/revoked_at DateTime(timezone=True), created_by_user_id FK, created_at/updated_at with `_utcnow` default); export from `backend/app/models/__init__.py`
- [X] T004 [P] Add `interview_time_limit_minutes: Mapped[int | None]` Integer nullable column to `Vacancy` in `backend/app/models/vacancy.py`
- [X] T005 [P] Create Alembic migration `backend/app/migrations/versions/20260905_000001_interview_links.py` (`down_revision = "20260904_000002"`) creating `interview_links` table (Uuid PK, FKs with `ondelete="CASCADE"`, unique constraint + index on `token`, index on `expires_at`) and adding `interview_time_limit_minutes` to `vacancies`, following the explicit `op.create_table`/`op.add_column` style of `20260904_000002_recruiter_vacancies.py`
- [X] T006 [P] Create schemas in `backend/app/schemas/interview_links.py`: `InterviewLinkCreateRequest` (first/last name + social required, `EmailStr | None`, `expires_at` aware datetime), `InterviewLinkExtendRequest` (`expires_at` future), `InterviewLinkItem` response (all fields incl. derived `status: InterviewLinkStatus`), `InterviewCardResponse` (`state: "available" | "in_progress" | "completed" | "unavailable"`, optional `reason`, `vacancy_title`, `candidate_first_name`, `last_name`, `expires_at`, `deadline_at`, `interview_time_limit_minutes`) — exact shapes in `contracts/interview-links-api.md`
- [X] T007 [P] Extend `backend/app/schemas/vacancies.py` + vacancy serialization in `backend/app/services/vacancy_service.py`: add `interview_time_limit_minutes: int | None` (validated `ge=5, le=240`) to create/update/detail/summary payloads, and add `"vacancy.links.view"` / `"vacancy.links.manage"` to the serialized `viewer_permissions` (owner recruiter gets both; expert with vacancy access gets view only; hiring manager neither)
- [X] T008 Create `InterviewLinkRepository` in `backend/app/repositories/interview_link_repository.py` following `vacancy_repository.py` conventions: `create` (add+flush), `commit`, `get_by_id`, `get_by_token`, `list_for_vacancy` (created_at desc), eager-load vacancy via `selectinload`
- [X] T009 Create `InterviewLinkService` in `backend/app/services/interview_link_service.py` with the derived-status engine from data-model.md: `_derive_status(link, vacancy, now)` (7-row precedence: revoked → completed → lazy-finalize in-progress past deadline → in_progress → expired → blocked if vacancy not approved → active), lazy persistence of `completed_at`, plus ownership check mirroring `VacancyService.ensure_recruiter_control` and domain exceptions (`InterviewLinkNotFoundError`, `InterviewLinkAccessError`, `InterviewLinkStateError`) with a `_handle_interview_link_error` mapper for routers
- [X] T010 Add dependency factories `get_interview_link_repository` / `get_interview_link_service` in `backend/app/dependencies/auth.py` following the existing `get_vacancy_service` pattern

**Checkpoint**: Foundation ready — model, migration, schemas, repository, service derivation engine, and wiring exist; user story phases can proceed.

---

## Phase 3: User Story 4 - Recruiter sets the interview time limit (Priority: P2, sequenced first — hard gate for US1)

**Goal**: Vacancy carries an editable `interview_time_limit_minutes` (default prefill 45, nullable, range 5–240); without it link creation is refused.

**Independent Test**: quickstart.md scenario A — set 30 on a draft, save, reopen (persists); clear it, save, attempt link create → refused with guidance.

### Tests for User Story 4

- [X] T011 [P] [US4] API test in `backend/tests/api/test_vacancies_api.py`: recruiter sets/clears `interview_time_limit_minutes` via vacancy update (persists; out-of-range 3 or 500 → 422)

### Implementation for User Story 4

- [X] T012 [US4] Ensure `VacancyService` create/update paths accept and persist `interview_time_limit_minutes` (null clears) in `backend/app/services/vacancy_service.py` — build on T007
- [X] T013 [US4] Add "Interview time limit (minutes)" field to the vacancy form in `frontend/components/vacancies/vacancy-form-sections.tsx`: numeric input, prefill 45 on new drafts, empty = not set, validation hint 5–240, disabled in read-only mode (reuses existing label/input grid idiom)

**Checkpoint**: Time limit editable end-to-end; spec US4 acceptance scenarios pass.

---

## Phase 4: User Story 1 - Recruiter creates a unique interview link and copies the invitation (Priority: P1) 🎯 MVP

**Goal**: Owner recruiter creates a link from an approved vacancy via a dialog (names + social + optional email + future expiration), sees it in the list as `active`, and copies a ready-made Moscow-time invitation to the clipboard. Expert sees the section read-only; hiring manager sees nothing.

**Independent Test**: quickstart.md scenario B — create on approved vacancy, row appears `active`, clipboard contains position/candidate/МСК deadline/link; refusals for draft vacancy and non-owner.

### Tests for User Story 1

- [X] T014 [P] [US1] API tests in `backend/tests/api/test_interview_links_api.py`: create link on approved vacancy → 201 `active` with unique token; create on draft/archived vacancy → 409; create when time limit null → 409; non-owner → 403; `expires_at` in past → 422; empty required fields → 422; expert can list → 200 read-only (manage → 403); hiring manager → 403/section-level denial
- [X] T015 [P] [US1] Service tests in `backend/tests/services/test_interview_link_service.py`: derived-status precedence rows 1–7 from data-model.md incl. lazy finalization writing `completed_at` exactly once

### Implementation for User Story 1

- [X] T016 [US1] Implement `create_link` in `backend/app/services/interview_link_service.py`: ownership check → vacancy approved check (409 `"Links can be created only for approved vacancies."`) → time-limit-set check (409 with guidance message) → `secrets.token_urlsafe(24)` token → persist → return `InterviewLinkItem`
- [X] T017 [US1] Create `backend/app/routers/interview_links.py` (router prefix `/api/v1/vacancies/{vacancy_id}/links`) with authenticated routes `GET /` (list; owner or expert view permission) and `POST /` (create; owner + `action.vacancies.manage`) wired to the service, string-`detail` errors via `_handle_interview_link_error`; register router in `backend/app/main.py`
- [X] T018 [US1] Add link API functions to `frontend/lib/api.ts`: `listVacancyLinks(token, vacancyId)`, `createVacancyLink(token, vacancyId, payload)` following the existing `request<T>` + `ApiError` pattern; add `"vacancy.links.view" | "vacancy.links.manage"` to the `ViewerPermission` union in the same file
- [X] T019 [P] [US1] Add `interviewLinkStatusTone`/`interviewLinkStatusLabel` helpers to `frontend/lib/vacancies.ts` next to `vacancyStatusTone` (active→positive, in_progress→warning, completed→positive, expired/revoked/blocked→danger) and `formatMoscowDateTime(iso)` helper using `Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle/date timeStyle... })`
- [X] T020 [P] [US1] Create `frontend/components/vacancies/candidate-link-create-dialog.tsx`: native `<dialog>` styled with design tokens (`.section-heading`/`.recruiter-users-panel` family), controlled inputs (first name, last name, social, optional email, `datetime-local` expiration with МСК hint), client validation blocking confirm on empty fields/past date, submits via `createVacancyLink`, inline `.field-error`/`.success-message` feedback
- [X] T021 [US1] Create `frontend/components/vacancies/candidate-link-section.tsx`: `<section className="recruiter-users-panel">` with `.section-heading` ("Candidate links" + 📎 Paperclip lucide icon create button), rows showing candidate info, social, email, creation/expiration dates (Moscow time), `.status` badge via tone helper, and a per-row Copy button; hidden when `vacancy.links.view` absent; actions rendered only with `vacancy.links.manage`; `navigator.clipboard.writeText` composing the FR-007 invitation text (position, candidate, `Доступно до` МСК, `{origin}/interview/{token}`) with inline copy-success feedback
- [X] T022 [US1] Render `<CandidateLinkSection vacancy={...} session={...} />` inside `.vacancy-layout__main` immediately after `<VacancyQuestionList/>` in `frontend/components/vacancies/vacancy-workspace.tsx`, passing viewer permissions from the loaded vacancy
- [X] T023 [P] [US1] Add any missing styles to `frontend/styles/app.css` strictly by extending existing patterns (dialog backdrop/positioning, link-row layout, copy-button state); verify `[data-theme="dark"]` parity

**Checkpoint**: quickstart.md scenario B passes — MVP (create + copy + list) works end-to-end.

---

## Phase 5: User Story 2 - Candidate opens the link and starts the interview (Priority: P1)

**Goal**: Public `/interview/{token}` page: interview card (position, name, МСК availability deadline, duration) with one "Start interview" button; started state shows running countdown off server `deadline_at`; unavailable reasons (expired / revoked / vacancy closed); completed state on reopen; refresh mid-interview resumes without second start.

**Independent Test**: quickstart.md scenarios C+D — incognito window, start in ≤2 clicks, countdown ticks, refresh resumes, timeout → "time is up" + recruiter sees `completed`, all four unavailable reasons correct.

### Tests for User Story 2

- [X] T024 [P] [US2] API tests in `backend/tests/api/test_interview_links_api.py`: `GET /api/v1/interview-links/{token}` for each state (available→card fields, in_progress→`deadline_at`, completed, unavailable reasons `expired`/`revoked`/`vacancy_closed`); unknown token → 404 same shape; `POST .../start` → 200 + recruiter sees `in_progress`; second start → 409; start on expired/revoked/blocked → 409 with named reason
- [X] T025 [P] [US2] Service test in `backend/tests/services/test_interview_link_service.py`: lazy finalization — read past deadline sets `completed_at = started_at + limit` exactly once and subsequent reads stay `completed`

### Implementation for User Story 2

- [X] T026 [US2] Implement `get_card_by_token(token)` and `start_by_token(token)` in `backend/app/services/interview_link_service.py`: no-auth token resolution; start refuses unless derived status is `active` (`started_at` set → 409 `"Interview already started."`); start sets `started_at = now` and returns card with `deadline_at = started_at + vacancy.interview_time_limit_minutes`
- [X] T027 [US2] Add public routes (no `get_current_user` dependency) to `backend/app/routers/interview_links.py`: `GET /api/v1/interview-links/{token}` and `POST /api/v1/interview-links/{token}/start` returning the exact shapes in `contracts/interview-links-api.md`
- [X] T028 [US2] Add public API functions `getInterviewCard(token)` / `startInterview(token)` to `frontend/lib/api.ts` (no auth token passed)
- [X] T029 [P] [US2] Create `frontend/app/interview/[token]/interview-client.tsx` (client component): fetch card on mount; render states — `available`: `.candidate-card` with position, candidate name, `expires_at` in Moscow time, duration, single primary "Start interview" button (calls `startInterview`, replaces state with in-progress); `in_progress`: large running countdown (1s interval from server `deadline_at`, zero → "time is up" screen); `unavailable`: reason-specific message per FR-012; `completed`: completion screen; loading and error fallbacks
- [X] T030 [US2] Rewrite `frontend/app/interview/[token]/page.tsx` to read `params` and render `<InterviewClient token={token} />`; keep the route outside `app/internal/` with no session access (public idiom); remove the obsolete placeholder content; delete/replace `frontend/app/interview/[token]/page.test.tsx` accordingly (no FE tests per user instruction — remove the stale test rather than maintain it)
- [X] T031 [P] [US2] Style the candidate page in `frontend/styles/app.css` (or scoped classes) extending `.candidate-card`/`.setup-stage` patterns: calm single-purpose layout, one primary action, mobile-width responsive, `[data-theme="dark"]` parity, no arbitrary colors

**Checkpoint**: quickstart.md scenarios C+D pass; spec US2 acceptance scenarios 1–7 hold.

---

## Phase 6: User Story 3 - Recruiter manages existing links (Priority: P2)

**Goal**: Per-row actions — copy invitation (from US1), revoke active/in-progress links with immediate effect, extend expiration of active links; revoked/completed refuse extend.

**Independent Test**: quickstart.md scenario E — two links for same candidate independent; revoke kills one instantly; extend keeps the other usable past original deadline; expert read-only; hiring manager section hidden.

### Tests for User Story 3

- [X] T032 [P] [US3] API tests in `backend/tests/api/test_interview_links_api.py`: revoke active → 200 `revoked`; revoke in_progress → 200; revoke revoked/completed/expired → 409; extend active → 200 new date honored; extend revoked/completed → 409; extend to past date → 422; non-owner revoke/extend → 403

### Implementation for User Story 3

- [X] T033 [US3] Implement `revoke_link(actor, vacancy_id, link_id)` (allowed from `active`/`in_progress`, sets `revoked_at = now`) and `extend_link(actor, vacancy_id, link_id, new_expires_at)` (allowed only from `active`) in `backend/app/services/interview_link_service.py`
- [X] T034 [US3] Add authenticated routes `POST /api/v1/vacancies/{vacancy_id}/links/{link_id}/revoke` and `POST .../extend` to `backend/app/routers/interview_links.py` per contract
- [X] T035 [US3] Add `revokeVacancyLink` / `extendVacancyLink` functions to `frontend/lib/api.ts`
- [X] T036 [US3] Extend `frontend/components/vacancies/candidate-link-section.tsx`: per-row Revoke button (confirm step naming the candidate; sets status `revoked` immediately in UI) and Extend control (inline `datetime-local` or reuse of the create dialog pattern) with actions disabled/hidden by derived status — extend only when `active`, revoke only when `active`/`in_progress`; non-manage viewers (expert) never see action buttons (already gated in US1)

**Checkpoint**: quickstart.md scenario E passes; spec US3 acceptance scenarios 1–5 hold.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story quality gates before calling the feature done.

- [X] T037 [P] Run full backend suite `cd backend && uv run pytest -q` — all green incl. new interview-link tests and existing vacancy/migration tests
- [X] T038 [P] Run frontend quality gates `cd frontend && npm run lint && npm run build` — clean
- [X] T039 Execute quickstart.md scenarios A–E manually end-to-end (incognito for candidate flows); fix any deviations found; check dark mode on both recruiter section and candidate page
- [X] T040 [P] Update `specs/009-candidate-interview-links/spec.md` status/implementation note (what is implemented vs open) per constitution principle II
- [X] T041 Sanity-check zero-new-dependency constraint: `backend/pyproject.toml` and `frontend/package.json` unchanged except lockfile churn; no Radix dialog/date libraries introduced

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (T003–T010).
- **US4 (Phase 3)**: Depends on Foundational; blocks US1's create flow (link creation refused without time limit). Small phase — do first.
- **US1 (Phase 4)**: Depends on Foundational + US4. MVP.
- **US2 (Phase 5)**: Depends on Foundational (backend card/start service + public routes are independent of US1's UI, but a link must exist to test — soft dependency on US1 backend tasks T016/T017).
- **US3 (Phase 6)**: Depends on US1 (list UI, copy, permissions) + US2 (in-progress state for revoke).
- **Polish (Phase 7)**: Depends on all stories in scope.

### User Story Dependencies

- **US4 → US1**: hard (creation requires the limit).
- **US1 → US3**: soft (manage actions live in the section built by US1).
- **US2**: independent of US1 frontend; needs US1 backend (a created link) only for manual testing.

### Within Each Story

- Backend tests first (they must fail before implementation), then service → router → frontend components → wiring.
- Story checkpoint verified via the quickstart.md scenario mapped to that story before moving on.

### Parallel Opportunities

- T001 ∥ T002; T004 ∥ T005 ∥ T006 ∥ T007 (different files); T014 ∥ T015; T018 ∥ T019 ∥ T020; T024 ∥ T025; T028 ∥ T029 ∥ T031; T032 standalone; T037 ∥ T038 ∥ T040 ∥ T041.
- US2 frontend (T028–T031) can be built in parallel with US1 frontend (T018–T023) once T016/T017 (backend create) are done, since the public API contract is fixed.

---

## Parallel Example: User Story 1

```bash
# Backend tests first (must fail pre-implementation):
Task: "API tests for create-link endpoints in backend/tests/api/test_interview_links_api.py"
Task: "Service tests for status derivation in backend/tests/services/test_interview_link_service.py"

# Then in parallel (different files):
Task: "Frontend API + permission types in frontend/lib/api.ts"
Task: "Status tone + Moscow-time helpers in frontend/lib/vacancies.ts"
Task: "Create-link dialog in frontend/components/vacancies/candidate-link-create-dialog.tsx"

# Then sequentially: service create → router → section component → workspace wiring → app.css styles
```

---

## Implementation Strategy

### MVP First (US4 + US1)

1. Phase 1 Setup → Phase 2 Foundational (critical).
2. Phase 3 US4 (small gate) → Phase 4 US1.
3. **STOP and VALIDATE** quickstart scenario B; demo-able MVP: recruiter creates and shares a link.

### Incremental Delivery

1. Add US2 (candidate start + countdown + reasons) → validate C+D. Feature is now functionally complete end-to-end.
2. Add US3 (revoke/extend) → validate E.
3. Polish phase → full quickstart run.

### Parallel Team Strategy

- Developer A: backend service+routers for US1/US2 (T016, T017, T026, T027, T033, T034).
- Developer B: frontend recruiter side (T018–T023, T035, T036).
- Developer C: frontend candidate page (T028–T031).
- Merge points: contracts/interview-links-api.md is the fixed interface; `frontend/lib/api.ts` and `app.css` are shared files — coordinate or serialize edits to them.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- Each story phase lists its quickstart.md scenario as the independent acceptance check.
- Backend test tasks must fail before their implementation tasks begin.
- Frontend has no test tasks (user instruction); stale interview page test removed in T030.
- Keep `contracts/interview-links-api.md` updated if any shape changes during implementation (constitution principle IV).
