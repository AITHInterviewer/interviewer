# Data Model: Candidate Interview Links

## Entity: `InterviewLink` (new)

```text
interview_links
├── id                  Uuid PK, default uuid4
├── vacancy_id          Uuid FK → vacancies.id, ON DELETE CASCADE, indexed
├── token               String(64), unique, indexed     # secrets.token_urlsafe(24)
├── candidate_first_name String(120), not null
├── candidate_last_name  String(120), not null
├── candidate_social    String(300), not null           # link or nickname to social network
├── candidate_email     String(320), nullable
├── expires_at          DateTime(timezone=True), not null, indexed   # link stops being startable
├── started_at          DateTime(timezone=True), nullable            # interview begin (clock #2 starts)
├── completed_at        DateTime(timezone=True), nullable            # durable finish (explicit or lazy)
├── revoked_at          DateTime(timezone=True), nullable
├── created_by_user_id  Uuid FK → internal_users.id, not null       # recruiter who issued it
├── created_at          DateTime(timezone=True), not null, default utcnow
└── updated_at          DateTime(timezone=True), not null, default utcnow, onupdate utcnow
```

Notes:
- Status is **not stored** — it is derived (see state rules below). Only durable facts are columns.
- Unique constraint on `token`; unique constraint on `(vacancy_id, id)` is implicit PK. Multiple links per candidate are allowed (FR-006) — no uniqueness on candidate name.
- Model file: `backend/app/models/interview_link.py`, exported from `backend/app/models/__init__.py`.
- Migration: `backend/app/migrations/versions/20260905_000001_interview_links.py` (`down_revision = "20260904_000002"`), explicit `op.create_table` per existing migration style.

## Entity change: `Vacancy` (extended)

```text
vacancies
└── interview_time_limit_minutes  Integer, nullable   # NEW; null = not set (link creation refused)
```

- Editable while vacancy is editable (goes through existing `VacancyUpdateRequest`, which already carries `expected_updated_at` optimistic locking).
- Validation in schema: `ge=5, le=240`. UI prefill default: **45** (spec assumption).

## Status derivation (single source of truth — service layer)

Evaluated top-to-bottom on every read:

| # | Condition | Derived status |
|---|-----------|----------------|
| 1 | `revoked_at` is set | `revoked` |
| 2 | `completed_at` is set | `completed` |
| 3 | vacancy.status ≠ `approved` | `blocked` |
| 4 | `started_at` set AND `now ≥ started_at + vacancy.interview_time_limit_minutes` | `completed` — lazily persist `completed_at` (= deadline) |
| 5 | `started_at` is set | `in_progress` |
| 6 | `now ≥ expires_at` | `expired` |
| 7 | otherwise | `active` |

Candidate-facing "unavailable reason" maps 1:1 to rows 1, 4 (time up → completed screen), 3, 6:
`revoked` → "closed by recruiter"; `expired` → "expired"; `blocked` → "vacancy closed"; `completed` → completed screen (FR-018).

Note: lazy finalization (row 4 persistence) happens *before* derivation on every read, so an interview that hit its deadline on a closed vacancy still finalizes as `completed` rather than `blocked`.

## State transitions

```text
            create (vacancy approved, limit set)
                 │
                 ▼
              active ──start──▶ in_progress ──candidate finishes──▶ completed
                 │                   │
   ┌─────────────┼───────────┐       │ deadline passes (lazy finalize on read)
   ▼             ▼           ▼       ▼
 revoked        expired    blocked  completed
 (recruiter)  (now ≥       (vacancy
               expires_at)  not approved)
```

- `revoke` allowed from `active` or `in_progress` (FR-009); immediate effect — no caching, derived on read.
- `extend` allowed only from `active` (FR-010: revoked/completed refused; `expired`/`blocked` are not extendable either — recruiter can create a fresh link instead).
- Vacancy re-approval after edits: links in `blocked` automatically return to `active`/`expired` per derivation — no data migration needed.
- Vacancy archived → all links `blocked`; restore + re-approve → usable again (edge case in spec).

## Validation rules (service + schema)

- Create: vacancy must exist; actor must own vacancy (FR-001); vacancy.status == `approved` (FR-002); `interview_time_limit_minutes` not null (FR-015); first/last name + social non-empty (FR-003); `expires_at` must be in the future (FR-004); email optional, basic format sanity via Pydantic `EmailStr`.
- Start (public): link exists by token; derived status must be `active` (not started, not expired, not revoked, vacancy approved) — otherwise 409/410-style refusal naming the reason; `started_at` already set → idempotent refusal (interview continues, no second start).
- Extend: actor owns vacancy; link in `active`; new `expires_at` in the future.
- Revoke: actor owns vacancy; link in `active` or `in_progress`.
