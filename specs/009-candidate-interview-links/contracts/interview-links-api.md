# Contract: Candidate Interview Links API

Base URL: backend serves `/api/v1` (frontend calls `${NEXT_PUBLIC_BACKEND_URL}/api/v1/...`).
Auth: recruiter/expert routes use `Authorization: Bearer <jwt>`; candidate routes are **public** (token in path IS the credential).
Error shape (existing convention, unchanged): `{ "detail": "<human-readable message>" }` with `ApiError.status` on the frontend.

## Shared types

```ts
type InterviewLinkStatus = "active" | "in_progress" | "completed" | "expired" | "revoked" | "blocked";

type InterviewLinkItem = {
  id: string;                        // uuid
  token: string;                     // opaque, used to build /interview/{token}
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_social: string;
  candidate_email: string | null;
  expires_at: string;                // ISO-8601 UTC
  status: InterviewLinkStatus;       // derived server-side
  created_at: string;                // ISO-8601 UTC
  started_at: string | null;
  completed_at: string | null;
};
```

---

## Recruiter/expert routes (authenticated)

Router: `app/routers/interview_links.py`, prefix `/api/v1/vacancies/{vacancy_id}/links`.

### List links — `GET /api/v1/vacancies/{vacancy_id}/links`

Permission: vacancy owner (any area with `vacancy.links.manage`) OR expert with read access (`vacancy.links.view`). 403 `VacancyAccessError` otherwise.

**Response 200:**
```json
{ "items": [ InterviewLinkItem, ... ] }
```
Sorted `created_at` desc. Statuses derived at read time (lazy finalization may write `completed_at`).

### Create link — `POST /api/v1/vacancies/{vacancy_id}/links`

Permission: vacancy owner + capability `action.vacancies.manage`. 403 otherwise.

**Request:**
```json
{
  "candidate_first_name": "Иван",
  "candidate_last_name": "Петров",
  "candidate_social": "t.me/ivan_p",
  "candidate_email": "ivan@example.com",        // optional
  "expires_at": "2026-09-12T21:00:00Z"          // must be in the future
}
```
**Response 201:** `InterviewLinkItem` (status `active`).

**Refusals:** vacancy not found 404; not owner 403; vacancy not `approved` 409 `"Links can be created only for approved vacancies."`; time limit not set 409 `"Set the interview time limit on the vacancy before creating links."`; `expires_at` in the past 422; empty required fields 422.

### Revoke link — `POST /api/v1/vacancies/{vacancy_id}/links/{link_id}/revoke`

**Request:** empty body. **Response 200:** updated `InterviewLinkItem` (status `revoked`).
Refusals: 404 link/vacancy; 403 non-owner; 409 unless current status is `active` or `in_progress` (`"Only active links can be revoked."`).

### Extend link — `POST /api/v1/vacancies/{vacancy_id}/links/{link_id}/extend`

**Request:** `{ "expires_at": "<ISO-8601 UTC, future>" }`. **Response 200:** updated `InterviewLinkItem`.
Refusals: same 404/403; 409 unless status `active` (`"Only active links can be extended."`); 422 past date.

---

## Public candidate routes (no auth)

Same router module; routes carry no `get_current_user` dependency. Token is looked up in `interview_links.token`.

### Get card state — `GET /api/v1/interview-links/{token}`

**Response 200 (accessible, not started):**
```json
{
  "state": "available",
  "vacancy_title": "Senior Python Developer",
  "candidate_first_name": "Иван",
  "candidate_last_name": "Петров",
  "expires_at": "2026-09-12T21:00:00Z",
  "interview_time_limit_minutes": 45
}
```

**Response 200 (in progress — also returned on refresh mid-interview):**
```json
{
  "state": "in_progress",
  "vacancy_title": "Senior Python Developer",
  "candidate_first_name": "Иван",
  "deadline_at": "2026-09-12T20:14:00Z",     // started_at + limit; countdown source of truth
  "interview_time_limit_minutes": 45
}
```

**Response 200 (completed — reopen after finish or timeout, FR-018):**
```json
{ "state": "completed", "vacancy_title": "...", "candidate_first_name": "..." }
```

**Response 200 (unavailable, FR-012):**
```json
{ "state": "unavailable", "reason": "expired" | "revoked" | "vacancy_closed" }
```
Unknown token → `404 { "detail": "Interview link not found." }` (deliberately same as expired/revoked to avoid token probing).

### Start interview — `POST /api/v1/interview-links/{token}/start`

Idempotency: if already started (and not completed), returns 409 `"Interview already started."` — client treats as in-progress and refetches.

**Response 200:** same body as `state: "in_progress"` above.
**Refusals:** unknown token 404; not startable 409 with `"detail"` naming the reason: `"Link expired."` / `"Link revoked by recruiter."` / `"Vacancy is closed."` / `"Interview already completed."`.

---

## Vacancy contract changes (spec 003 extension)

`VacancyDetailResponse` / `VacancySummaryResponse` gain:
```json
"interview_time_limit_minutes": 45   // number | null
```
`VacancyUpdateRequest` gains:
```json
"interview_time_limit_minutes": 45   // optional, integer 5–240, null clears
```
`viewer_permissions` union on vacancy responses gains two members:
```ts
type ViewerPermission = ... | "vacancy.links.view" | "vacancy.links.manage";
```
- Owner recruiter: both. Expert with vacancy access: `vacancy.links.view` only. Hiring manager / other roles: neither (section hidden, FR-001a).

---

## Frontend contract consumers

- `frontend/lib/api.ts`: typed functions `listVacancyLinks`, `createVacancyLink`, `revokeVacancyLink`, `extendVacancyLink` (token-bearing) and `getInterviewCard(token)`, `startInterview(token)` (no token); new `ViewerPermission` members.
- `frontend/lib/vacancies.ts`: `interviewLinkStatusTone(status)` helper next to `vacancyStatusTone` (`active`→positive, `in_progress`→warning, `completed`→positive/neutral, `expired`/`revoked`/`blocked`→danger).
- Invitation message composed client-side at copy time (FR-007):

```text
{vacancy_title} — интервью для {first_name} {last_name}
Доступно до: {expires_at formatted Europe/Moscow ru-RU}
{origin}/interview/{token}
```
