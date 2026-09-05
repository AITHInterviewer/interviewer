# Phase 0 Research: Candidate Interview Links

All Technical Context items resolved against the actual codebase. No open NEEDS CLARIFICATION remains.

## R1. Link token generation

- **Decision:** `secrets.token_urlsafe(24)` (~32 URL-safe characters, 192 bits of entropy), stored in a dedicated unique `token` column; candidate URL is `{frontend_origin}/interview/{token}`.
- **Rationale:** FR-005 requires unguessable links; `secrets` is the stdlib CSPRNG. 192 bits makes guessing practically impossible (SC-003) without the storage/URL overhead of longer tokens. No UUID encoding needed.
- **Alternatives considered:** `uuid4()` hex (128 bits, longer, leaks nothing but is not URL-optimized); 64-char tokens (overkill for a hackathon-scale app).

## R2. Public (unauthenticated) candidate endpoints

- **Decision:** A separate public router `app/routers/interview_links.py` — wait: public routes live in the same `interview_links` router module as recruiter routes but WITHOUT `Depends(get_current_user)`. Token resolution happens inside the service (lookup by token, then derive state). Routes:
  - `GET /api/v1/interview-links/{token}` → card state or block reason (no auth).
  - `POST /api/v1/interview-links/{token}/start` → begins interview (no auth).
- **Rationale:** This is the first unauthenticated-but-authorized surface in the backend (only `/health` and auth register/login are public today). Keeping it in one feature-scoped router module with clear route-level auth (or absence of it) is the smallest change; a separate router file would duplicate wiring for no benefit. Token-as-capability replaces JWT for candidates — no session, no account (FR-011).
- **Alternatives considered:** JWT-for-candidates (violates "no login/account"); separate public router file (extra wiring, no gain).

## R3. Status derivation & enforcement (no background jobs)

- **Decision:** `InterviewLink` stores only durable facts: `revoked_at`, `started_at`, `completed_at`, `expires_at`, plus vacancy FK. Status (`active` / `in progress` / `completed` / `expired` / `revoked` / `blocked`) is **derived at read time** in the service:
  - `revoked_at` set → `revoked`
  - `completed_at` set → `completed`
  - `started_at` set and now ≥ `started_at + vacancy.interview_time_limit` → `completed` (auto-set `completed_at` on read — see R4)
  - not started and now ≥ `expires_at` → `expired`
  - vacancy not `approved` (or archived / returned to draft) → `blocked`
  - else `active` / `in progress`
- **Rationale:** No scheduler/worker exists in the stack and SC-006 ("blocked within seconds") is satisfied by client countdown + server-derived status on the next read. This follows constitution principle V (smallest correct design).
- **Alternatives considered:** Celery/Redis scheduled finalization (infrastructure for zero user-visible gain at this scale); DB-triggered status (business logic in the database, untestable in service tests).

## R4. Time-limit finalization semantics

- **Decision:** When a started interview passes its deadline, the **server lazily finalizes** on the next read: sets `completed_at = started_at + limit`, persists it, and reports `completed`. The candidate client counts down locally and shows the "time is up" screen at zero; on refresh/reopen the server state agrees.
- **Rationale:** FR-014 + clarification Session 2026-09-05 Q1 (timeout ⇒ `completed`, answers count). Lazy finalization makes the completed state durable for the recruiter list without a worker.
- **Alternatives considered:** Leaving `completed_at` null and deriving forever (recruiter list would flap between "in progress"/"completed" around the boundary; persistence is clearer).

## R5. Moscow-time display, UTC storage

- **Decision:** Backend stores/returns timezone-aware UTC ISO-8601 (existing pattern: `DateTime(timezone=True)`, `datetime.now(UTC)`). All Moscow-time formatting is frontend-only via `Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", ... })`. The invitation text is composed on the **frontend** at copy time (it needs position title + candidate name + Moscow deadline + absolute URL).
- **Rationale:** Matches existing backend behavior (no Moscow helpers exist backend-side per codebase scan) and the spec assumption "internally stored precisely with timezone".
- **Alternatives considered:** Backend-composed invitation text (couples presentation to API, needs frontend origin config server-side).

## R6. Create-link dialog

- **Decision:** Native HTML `<dialog>` element styled with existing design tokens, opened from the 📎 "Create link" button in the section heading. Form is fully controlled (existing codebase idiom — no form library), fields: first name, last name, social link, optional email, `datetime-local` expiration picker with a "МСК" hint.
- **Rationale:** The codebase has **no dialog component and no Radix dialog dependency**; `components.json` is configured for shadcn, but adding `@radix-ui/react-dialog` + CLI-generated files violates minimalism (principle V) when the native element provides focus trapping, Esc handling, and accessibility for free. Native `datetime-local` is likewise the zero-dependency answer — no date picker exists in the project.
- **Alternatives considered:** shadcn Dialog via CLI (new dependency, 3+ generated files for one use); inline composer like the question textarea (weaker UX for a 5-field form; a modal keeps the list context visible).

## R7. Copy invitation

- **Decision:** Small client-side helper composing the message and `navigator.clipboard.writeText(...)`; inline `.success-message` / `.field-error` feedback (existing idiom — no toast system exists).
- **Message format (FR-007):**
  ```
  {position title} — интервью для {first name} {last name}
  Доступно до: {deadline, Europe/Moscow, ru-RU}
  {frontend_origin}/interview/{token}
  ```
- **Rationale:** First clipboard use in the codebase; inline feedback matches the workspace's existing `setStatus`/`setError` pattern. Clipboard API requires secure context (localhost and real deployments qualify).

## R8. Countdown & mid-interview refresh

- **Decision:** On successful start, the server returns the card including `deadline_at` (= `started_at + limit`). The client runs a 1s interval countdown from that server timestamp (clock skew handled by using server time as source of truth). Refresh mid-interview: `GET` by token returns state `in progress` + remaining deadline — client resumes countdown, no second start possible (service refuses start when `started_at` already set). Device/session binding stays deferred per spec assumptions.

## R9. Vacancy `interview_time_limit_minutes`

- **Decision:** `Mapped[int | None] = mapped_column(Integer, nullable=True)` on `Vacancy`; the vacancy form prefills 45 (spec assumption) but the field can be cleared (nullable ⇒ "not set", Story 4 scenario 2); link creation requires a non-null value (validation in service, clear message per FR/scenario). Valid range 5–240 minutes enforced in the schema (`ge=5, le=240`).
- **Rationale:** The spec requires both a sensible default and a "not set ⇒ refuse creation" path; nullable + prefill satisfies both. Range guardrails prevent nonsense values without restricting real use.
- **Alternatives considered:** NOT NULL with default 45 (makes "never set" impossible, contradicting Story 4 scenario 2); free integer (no guardrails).

## R10. Permissions model

- **Decision:**
  - Backend: object-level checks in `InterviewLinkService` mirroring `VacancyService.ensure_recruiter_control` — manage operations require the acting user to own the vacancy; read-only list allowed for users with the expert area capability who can view the vacancy (mirrors `expert_vacancies` access).
  - Frontend: extend the `ViewerPermission` union in `frontend/lib/api.ts` with `vacancy.links.view` (owner recruiter + expert) and `vacancy.links.manage` (owner recruiter only). Workspace renders the section when `view` is present, actions only when `manage` is present (FR-001a: hiring manager gets neither → section hidden).
- **Rationale:** Matches the existing server-driven permission idiom (`viewer_permissions` on `VacancyDetail`, `hasViewerPermission` gating); no role-string hardcoding in UI.

## R11. Frontend testing

- **Decision:** No new frontend tests (explicit user instruction). Frontend verification is manual via `quickstart.md` scenarios; backend keeps pytest coverage for service/API rules (status derivation, permission refusals, expiration).
- **Rationale:** User instruction overrides; constitution principle V requires verification steps be defined and executed — quickstart.md defines them.
