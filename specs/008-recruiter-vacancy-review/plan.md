# Implementation Plan: Recruiter Vacancy Review Workflow

**Branch**: `[008-recruiter-vacancy-review]` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-recruiter-vacancy-review/spec.md` plus planning guidance that the workflow must be fully determined, permissions must be adjusted, and the web experience must be organized with useful UI/UX best practices.

## Summary

Implement the first recruiter vacancy slice as a full-stack workflow on top of the existing internal auth and capability system: recruiter-owned and recruiter-managed vacancy CRUD, question authoring with optional assessment metadata, expert review through role-separated APIs, approval and change-request decisions, automatic draft reset on significant recruiter edits to approved content, and archive/restore lifecycle. The backend remains the policy source of truth and returns per-viewer action hints so a single shared vacancy workspace route can adapt its controls for recruiter and expert users without duplicating authorization rules in the client. Frontend work replaces the current recruiter vacancies placeholder and expert question stub with a practical internal product flow: recruiter vacancy list, expert review queue, and a shared vacancy detail workspace structured around role brief, candidate profile, interview pack, and review state.

## Technical Context

**Language/Version**: Python 3.12 backend; TypeScript 5.9 with Next.js 16.1 and React 19 frontend

**Primary Dependencies**: FastAPI, Pydantic, SQLAlchemy, Alembic, python-jose, passlib on backend; Next.js, React, Tailwind 4, existing `app.css` design patterns, and current internal auth helpers on frontend; no new third-party dependencies required

**Storage**: Relational SQL database through SQLAlchemy and Alembic for vacancies, vacancy questions, and review decisions; existing internal user tables remain the identity source; browser local storage continues to cache the signed-in internal session

**Testing**: `pytest` for backend models, services, permissions, lifecycle transitions, reset behavior, and API contracts; `vitest` for frontend route behavior, shared workspace rendering, role-conditioned actions, and error/loading states

**Target Platform**: Internal web application for modern desktop browsers first, with responsive behavior that remains usable on tablet and mobile widths; backend runs in local Docker and direct local development

**Project Type**: Full-stack web application with separate frontend and backend services

**Performance Goals**: Vacancy list, detail, and review actions should feel immediate for normal internal usage; normal recruiter and expert reads should complete within standard sub-second internal app expectations for vacancies with up to 50 questions, and stale-write conflicts should be detected on the first conflicting save attempt

**Constraints**: Reuse the existing internal auth and capability framework; keep recruiter and expert APIs role-separated even when the UI route is shared; enforce approval reset rules server-side; preserve permissive MVP submission behavior; honor inherited recruiter access for vacancies created by recruiter-managed internal users; follow the existing frontend design tokens and component language; avoid introducing candidate-link or interview-execution scope in this slice

**Scale/Scope**: MVP targets low-concurrency internal usage with tens to low hundreds of active vacancies, typical vacancy question packs of 0-50 questions, lightweight review history, and a single shared vacancy workspace usable by both recruiter and expert roles

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-first delivery**: PASS. Work is grounded in `specs/008-recruiter-vacancy-review/spec.md` before implementation.
- **Single SDD source of truth**: PASS. This feature directory is the active planning source for the recruiter vacancy authoring and review slice.
- **Vertical slices over horizontal layers**: PASS. The implementation will be decomposed into recruiter authoring, review submission, expert review, and approved/archive lifecycle slices rather than backend/frontend layer batches.
- **Contract-first frontend/backend boundaries**: PASS. Phase 1 defines explicit vacancy workflow API contracts and a shared workspace contract before coding.
- **Minimalism and verifiable change**: PASS. The design adds only the persistence and policy pieces needed for this slice: vacancy entities, review decision history, capability extensions, and one shared UI workspace pattern.
- **UI identity**: PASS. The plan explicitly reuses `frontend/styles/tokens.css`, `frontend/styles/app.css`, and existing workspace components, avoiding any separate visual system.
- **Post-design re-check**: PASS. Phase 1 keeps the existing repo split, extends current internal auth/capability patterns, and adds no unjustified architecture layers or dependency changes.

## Project Structure

### Documentation (this feature)

```text
specs/008-recruiter-vacancy-review/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── vacancy-review.openapi.yaml
│   └── shared-vacancy-workspace.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── dependencies/
│   │   └── auth.py
│   ├── main.py
│   ├── migrations/
│   │   └── versions/
│   ├── models/
│   │   ├── user.py
│   │   ├── vacancy.py                  # new
│   │   ├── vacancy_question.py         # new
│   │   └── vacancy_review_decision.py  # new
│   ├── repositories/
│   │   ├── user_repository.py
│   │   └── vacancy_repository.py       # new
│   ├── roles/
│   │   └── catalog.py                  # extend recruiter/expert capabilities
│   ├── routers/
│   │   ├── auth.py
│   │   ├── roles.py
│   │   ├── vacancies.py                # recruiter API
│   │   └── expert_vacancies.py         # expert API
│   ├── schemas/
│   │   ├── auth.py
│   │   └── vacancies.py                # new request/response models
│   └── services/
│       ├── auth_service.py
│       ├── role_service.py
│       ├── user_admin_service.py
│       ├── vacancy_service.py          # lifecycle, reset, archive/restore, recruiter ownership chain
│       └── vacancy_review_service.py   # expert review policy and decisions
└── tests/
    ├── api/
    │   ├── test_vacancies_api.py
    │   └── test_expert_vacancies_api.py
    └── services/
        └── test_vacancy_workflow.py

frontend/
├── app/
│   └── internal/
│       ├── recruiter/
│       │   ├── page.tsx
│       │   └── vacancies/
│       │       └── page.tsx            # recruiter vacancy list
│       ├── expert/
│       │   ├── page.tsx
│       │   └── vacancies/
│       │       └── page.tsx            # expert review queue
│       └── vacancies/
│           └── [vacancyId]/page.tsx    # shared vacancy workspace
├── components/
│   ├── auth/
│   │   ├── recruiter-workspace.tsx
│   │   └── expert-workspace.tsx
│   └── vacancies/
│       ├── vacancy-list.tsx
│       ├── vacancy-workspace.tsx
│       ├── vacancy-form-sections.tsx
│       ├── vacancy-question-list.tsx
│       └── review-state-panel.tsx
├── lib/
│   ├── api.ts                          # vacancy/review client calls
│   ├── auth.ts
│   └── vacancies.ts                    # UI helpers for status, permissions, summaries
└── styles/
    ├── tokens.css
    ├── app.css
    └── design-system.md
```

**Structure Decision**: Keep the existing backend/frontend split and current layering. Add one vacancy domain with minimal dedicated persistence, service, schema, and router files. On the frontend, keep the existing protected internal shell and add vacancy-specific components plus one shared detail route so recruiter and expert users work in the same workspace while still calling different backend APIs.

## Complexity Tracking

No constitution violations require justification. The design intentionally avoids full revision history, live collaborative editing, runtime permission management UI, and candidate-flow implementation in this slice.
