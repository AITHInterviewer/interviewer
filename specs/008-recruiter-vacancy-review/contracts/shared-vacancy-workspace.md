# Shared Vacancy Workspace Contract

## Purpose

Define how one vacancy detail route behaves for both recruiter and expert users while keeping backend permission boundaries separate.

## Route Shape

- Shared detail route: `/internal/vacancies/[vacancyId]`
- Recruiter entry point: `/internal/recruiter/vacancies`
- Expert entry point: `/internal/expert/vacancies`

The detail page is shared. Entry lists are role-specific.

## Page Structure

1. Top context row
   - vacancy title
   - grade
   - current status badge
   - owner/reviewer metadata
2. Main workspace sections
   - `Role brief`
   - `Candidate profile`
   - `Interview pack`
3. Supporting side panel on desktop, stacked below on mobile
   - `Review state`
   - latest decision
   - latest comment
   - action buttons relevant to current viewer

## Section Behavior by Viewer Permission

| Permission | UI behavior |
|--------|-------------|
| `vacancy.body.edit` | Role brief and candidate profile fields are editable inputs |
| `vacancy.questions.edit` | Question rows and question metadata controls are editable |
| `vacancy.submit` | Show primary `Submit for review` action |
| `vacancy.approve` | Show primary `Approve` action |
| `vacancy.request_changes` | Show secondary `Request changes` action with optional comment field |
| `vacancy.archive` | Show `Archive` action in review-state panel |
| `vacancy.restore` | Show `Restore` action in review-state panel |
| `vacancy.review_history.view` | Show review history summary and latest decision block |

If a permission is absent, the related controls are read-only or hidden. The UI must not attempt unauthorized mutations.

## Role and Status Matrix

| Viewer | Vacancy status | Editable sections | Primary actions |
|--------|----------------|------------------|-----------------|
| Recruiter controller (direct creator or managing recruiter) | `draft` | body + questions | save changes, submit |
| Recruiter controller (direct creator or managing recruiter) | `changes_requested` | body + questions | save changes, submit |
| Recruiter controller (direct creator or managing recruiter) | `approved` | body + questions | save changes, archive |
| Recruiter controller (direct creator or managing recruiter) | `archived` | none | restore |
| Expert reviewer | `submitted_for_review` | questions only | approve, request changes |
| Expert reviewer | `approved` | none | none |
| Expert reviewer | `archived` | none | none |

## UX Rules

- Keep one clear primary action per state.
- Show status and latest review outcome without scrolling deep into the page.
- Use existing neutral surfaces, semantic status colors, and current workspace patterns from `frontend/styles/app.css`.
- Keep desktop layout information-dense but not cramped.
- On mobile, stack sections vertically and keep action buttons full-width.
- Always provide explicit loading, empty, success, conflict, and permission-denied states.
- Conflict errors should tell the user the vacancy changed elsewhere and offer refresh/reload.

## List UX Requirements

### Recruiter vacancy list

- Default grouping: active vacancies first, archived last.
- Include vacancies created directly by the signed-in recruiter and vacancies controlled through the managing recruiter ownership chain.
- Show title, grade, status, question count, last updated time, and latest review outcome.
- Primary page action: `Create vacancy`.
- Empty state should explain how to create the first vacancy.

### Expert review queue

- Default view shows only `submitted_for_review` vacancies.
- Show title, grade, submitting recruiter, submitted time, and question count.
- Empty state should confirm there is nothing waiting for review.

## State Messaging

- `draft`: recruiter is still authoring the vacancy.
- `submitted_for_review`: waiting for expert action.
- `changes_requested`: expert returned the vacancy for recruiter updates.
- `approved`: assessment pack is approved for downstream use.
- `archived`: vacancy is closed and unavailable for further operational use until restored.
