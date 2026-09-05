# Quickstart: Recruiter Vacancy Review Workflow

## Purpose

Validate end-to-end that recruiters can author and manage vacancies, experts can review them through a controlled question-pack workflow, permissions are enforced correctly, approval resets behave correctly, and the shared vacancy workspace remains useful across states.

## Prerequisites

- Backend dependencies installed.
- Frontend dependencies installed.
- Environment configured from `backend/.env.example` and `frontend/.env.example`.
- Current feature artifacts available:
  - [spec.md](./spec.md)
  - [plan.md](./plan.md)
  - [data-model.md](./data-model.md)
  - [contracts/vacancy-review.openapi.yaml](./contracts/vacancy-review.openapi.yaml)
  - [contracts/shared-vacancy-workspace.md](./contracts/shared-vacancy-workspace.md)

## Suggested Validation Sequence

Run backend commands from `backend/`.

### 1. Run backend automated checks

```bash
uv run pytest tests
```

**Expected outcome**:
- Vacancy lifecycle tests pass.
- Recruiter ownership and expert review permission tests pass.
- Approved-to-draft reset tests pass for body, question text, reference answer, and question metadata edits.
- Conflict detection tests pass for stale writes.

### 2. Run frontend automated checks

```bash
npm --prefix frontend test
```

**Expected outcome**:
- Recruiter vacancy list, expert queue, and shared workspace component tests pass.
- Role-conditioned action visibility matches backend-provided viewer permissions.
- Empty, loading, denied, and conflict states render correctly.

### 3. Start the application locally

```bash
docker compose -f docker-compose.dev.yml up --build
```

**Expected outcome**:
- Frontend and backend start successfully.
- Internal auth, recruiter vacancy routes, and expert vacancy routes are reachable.

### 4. Validate recruiter vacancy creation and draft editing

1. Sign in as a recruiter.
2. Open the recruiter vacancy list.
3. Create a vacancy draft.
4. Fill in title, grade, job description, candidate profile, skills, and at least two questions.
5. Save and reopen the vacancy.

**Expected outcome**:
- The vacancy is created in `draft`.
- All entered content persists.
- The recruiter can edit both vacancy body and question pack.

### 4a. Validate inherited recruiter control for managed users

1. As the primary recruiter, create a managed internal user with recruiter access.
2. Sign in as that managed recruiter user.
3. Create a vacancy draft.
4. Return to the primary recruiter account and open the recruiter vacancy list.

**Expected outcome**:
- The vacancy created by the managed recruiter appears in the primary recruiter's recruiter vacancy flow.
- The primary recruiter can open, edit, submit, archive, and restore that vacancy when its state allows those actions.

### 5. Validate permissive MVP submission

1. Create another vacancy with minimal content.
2. Leave required skills empty.
3. Leave question metadata partially empty or skip questions entirely.
4. Submit for review.

**Expected outcome**:
- Submission succeeds.
- Vacancy moves to `submitted_for_review`.
- Submission timestamp is visible in the review-state panel.

### 6. Validate expert review flow

1. Sign in as an expert.
2. Open the expert review queue.
3. Open a submitted vacancy.
4. Attempt to edit vacancy body fields.
5. Edit question text, reference answer, and metadata.
6. Request changes on one vacancy and approve another.

**Expected outcome**:
- The expert queue shows submitted vacancies only.
- Body-field edits are rejected.
- Question-pack edits succeed.
- `Request changes` moves the vacancy to `changes_requested` and records the latest decision.
- `Approve` moves the vacancy to `approved` and records approver and timestamp.

### 7. Validate recruiter revision after change request

1. Return to the recruiter account that owns the vacancy with `changes_requested`.
2. Open the shared vacancy workspace.
3. Edit either the vacancy body or the question pack.

**Expected outcome**:
- The vacancy returns to `draft` once the recruiter saves changes.
- The recruiter can submit it again.

### 8. Validate automatic reset on significant approved changes

1. Open an approved vacancy as the owning recruiter.
2. Change one significant field at a time across separate checks:
   - title
   - job description
   - required skills
   - question text
   - reference answer
   - question metadata
3. Save after each change.

**Expected outcome**:
- Each significant change resets the vacancy from `approved` to `draft`.
- Approval metadata is cleared from current state.
- Review decision history remains visible.

### 9. Validate archive and restore lifecycle

1. Archive an approved vacancy.
2. Confirm it disappears from active recruiter workflows.
3. Restore it.

**Expected outcome**:
- Archived vacancy becomes non-operational.
- Restore returns the vacancy to its prior active state.
- No authored questions or review history are lost.

### 10. Validate stale-write conflict handling

1. Open the same vacancy in two browser sessions.
2. Save a change in the first session.
3. Save a different change in the second session without reloading.

**Expected outcome**:
- The second save is rejected with a conflict response.
- The UI explains that newer server data exists and prompts reload.

### 11. Validate shared workspace UX states

1. Review the vacancy page as recruiter in `draft`, `approved`, and `archived`.
2. Review the same page as expert in `submitted_for_review` and a non-reviewable state.
3. Resize the browser to mobile width.

**Expected outcome**:
- Only relevant actions appear for each viewer and state.
- Read-only vs editable sections are visually obvious.
- Mobile layout stacks cleanly without losing action access.

## Evidence to Capture

- One recruiter vacancy list screenshot with mixed statuses.
- One expert review queue screenshot.
- One shared workspace screenshot in recruiter edit mode.
- One shared workspace screenshot in expert review mode.
- One API response showing `viewer_permissions`.
- One conflict error example.

## Exit Criteria

- Recruiters can create, edit, submit, archive, and restore their own vacancies.
- Experts can review submitted vacancies, edit only the interview pack, and approve or request changes.
- Approved vacancies reset to `draft` on significant recruiter edits.
- Shared vacancy workspace behavior matches documented viewer permissions.
- Recruiter and expert permissions remain backend-authoritative and role-separated.
