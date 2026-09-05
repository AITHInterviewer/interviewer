# Implementation Plan: Candidate Interview Links

**Branch**: `009-candidate-interview-links` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-candidate-interview-links/spec.md`

## Summary

Recruiters generate unique, expiring per-candidate interview links from approved vacancies; candidates open `/interview/{token}` with no login, start the interview, and are stopped by the vacancy's time limit. Implementation: new `InterviewLink` model + service with **derived** status (active / in progress / completed / expired / revoked / blocked — lazily finalized, no background jobs), a new `interview_time_limit_minutes` field on `Vacancy`, one authenticated management API (owner-only manage, expert read-only via `viewer_permissions`), and the first public token-authenticated API surface. Frontend: a "Candidate links" section in the existing vacancy workspace (native `<dialog>` create form, clipboard invitation, status badges from existing tokens) and a full public candidate page (interview card → started countdown → unavailable/completed states), built per the project design system with one primary action per screen. No frontend tests are generated (explicit user instruction); backend pytest covers the rules.

## Technical Context

**Language/Version**: Python ≥3.12 (backend, FastAPI); TypeScript / React 19 / Next.js 16 (frontend)

**Primary Dependencies**: FastAPI + SQLAlchemy 2 (async) + Pydantic + Alembic (uv); Tailwind 4 + shadcn-style components + lucide-react (frontend). No new dependencies are introduced (native `<dialog>`, native `datetime-local`, `navigator.clipboard`, `Intl` for Moscow time).

**Storage**: SQLite default (`aiosqlite`), Postgres in Docker; timezone-aware UTC datetimes; new `interview_links` table + `vacancies.interview_time_limit_minutes` column with Alembic migration `20260905_000001`.

**Testing**: Backend: pytest + anyio + httpx `ASGITransport` (existing `tests/api`, `tests/services` conventions). Frontend: **no new tests** (user instruction) — manual validation per `quickstart.md`.

**Target Platform**: Linux/macOS dev server; browser (Chrome/Firefox/Safari, desktop + mobile widths for the candidate page).

**Project Type**: web application (frontend + backend)

**Performance Goals**: Link open/start respond < 500 ms p95; recruiter list < 300 ms for ≤ 100 links/vacancy; countdown ticks client-side off a server-computed deadline (no per-second API calls).

**Constraints**: SC-006 — running interview blocked within seconds of limit (client countdown + lazy server finalization); SC-003 — 192-bit unguessable tokens (`secrets.token_urlsafe(24)`); Moscow-time display via `Intl` only; all new UI must satisfy `[data-theme="dark"]`.

**Scale/Scope**: Hackathon MVP scale — single-tenant, dozens of links per vacancy, no rate limiting on token guessing beyond token entropy (documented deferral).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Notes |
|-----------|---------|-------|
| I. Spec-First Delivery | ✅ | `spec.md` written and clarified before this plan; no code yet. |
| II. Single SDD Source Of Truth | ✅ | Work tracked in `specs/009-candidate-interview-links/`; `openspec/` untouched. |
| III. Vertical Slices | ✅ | Implementation stays organized by the four spec user stories (tasks.md will follow). |
| IV. Contract-First Boundaries | ✅ | `contracts/interview-links-api.md` defines every new request/response before implementation. |
| V. Minimalism | ✅ | Derived status (no worker), native dialog (no Radix dep), no new libraries, no FE tests per user instruction; backend pytest retained for business rules. |
| UI Identity | ✅ | Reuses `.status`, `.section-heading`, `.recruiter-users-panel`, `.candidate-card`, `.setup-stage` and semantic tokens; no arbitrary colors/radii. |

No violations — Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/009-candidate-interview-links/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── interview-links-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── models/
│   │   ├── interview_link.py        # NEW: InterviewLink model
│   │   └── vacancy.py               # + interview_time_limit_minutes
│   ├── schemas/
│   │   ├── interview_links.py       # NEW: request/response schemas
│   │   └── vacancies.py             # + time-limit field on create/update/detail
│   ├── repositories/
│   │   └── interview_link_repository.py  # NEW: async CRUD by id/token/vacancy
│   ├── services/
│   │   └── interview_link_service.py     # NEW: derivation, permissions, start/revoke/extend
│   ├── routers/
│   │   └── interview_links.py       # NEW: owner/expert routes + public token routes
│   ├── dependencies/
│   │   └── auth.py                  # + service/repository factories
│   ├── roles/catalog.py             # + link capability constants (if needed)
│   └── migrations/versions/
│       └── 20260905_000001_interview_links.py  # NEW
└── tests/
    ├── api/test_interview_links_api.py       # NEW: endpoints incl. public ones
    └── services/test_interview_link_service.py  # NEW: status derivation, refusals

frontend/
├── app/interview/[token]/page.tsx   # REWRITE: public candidate page (card/start/countdown/states)
├── components/vacancies/
│   ├── candidate-link-section.tsx   # NEW: links section (list, badges, actions)
│   ├── candidate-link-create-dialog.tsx  # NEW: native <dialog> form
│   └── vacancy-workspace.tsx        # + render section under VacancyQuestionList, permission gate
├── lib/
│   ├── api.ts                       # + link API functions, ViewerPermission members
│   └── vacancies.ts                 # + interviewLinkStatusTone helper
└── styles/app.css                   # + minor styles extending existing patterns only
```

**Structure Decision**: Option 2 (web application). Backend placement mirrors the existing vacancy feature exactly (model/schema/repository/service/router layering, `_handle_*_error` router convention, string-`detail` errors). Frontend placement mirrors `vacancy-question-list.tsx`: a feature-scoped component rendered in `.vacancy-layout__main` after `<VacancyQuestionList/>`, permission-gated by server-driven `viewer_permissions`; the public candidate page lives outside `app/internal/` and never touches the session (existing public-page idiom).
