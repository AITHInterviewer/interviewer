# Implementation Plan: Extensible Multi-Role Internal Users

**Branch**: `[007-multi-role-assignment]` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-multi-role-assignment/spec.md` (merged scope: multi-role assignment + extensible role registry)

## Summary

Replace the current single-role internal auth slice with an extensible multi-role model delivered in one change set: migrate the `internal_users.role` enum column to a normalized `internal_role_assignments` table (existing accounts become one assignment each), introduce a declarative role registry (typed backend module: capability catalog + role definitions, validated at startup), and move all access decisions behind capability-aware checks that resolve the union of capabilities across a user's assigned roles. API contracts move to `roles` collections plus a registry snapshot endpoint; the frontend renders role options, labels, and navigation from backend payloads instead of hardcoded role switches. Adding a new role becomes a registry-only change.

## Technical Context

**Language/Version**: Python 3.11 backend, TypeScript on Next.js frontend

**Primary Dependencies**: FastAPI, Pydantic, SQLAlchemy, Alembic, python-jose, passlib; Next.js, React, Tailwind, shadcn/ui patterns; no new third-party dependencies

**Storage**: Relational SQL database via SQLAlchemy models and Alembic migrations (new `internal_role_assignments` table; `internal_users.role` column dropped); role registry and capability catalog held in-memory, loaded from a typed declarative module at application startup; browser local storage for internal auth session cache

**Testing**: `pytest` for backend registry validation, migration, capability resolution, and API gating; `vitest` for frontend auth helpers, registry-consumption, and landing-driven route behavior

**Target Platform**: Web application for modern desktop/mobile browsers with Linux-based backend service runtime in local Docker and direct local dev

**Project Type**: Full-stack web application with separate frontend and backend services

**Performance Goals**: Registry lookup is in-memory after startup; login, landing resolution, user listing, role updates, and capability checks must stay within existing single-request web expectations and add no noticeable delay to protected-page entry

**Constraints**: Must preserve one internal identity per person, migrate existing single-role accounts without recreation, keep built-in role behavior (recruiter, hiring_manager, expert) identical, reject malformed registries at startup with clear errors, enforce the role-retirement guard (FR-024), remain traceable to documented contracts, and add no runtime role-management UI

**Scale/Scope**: MVP internal-user population is small and manually managed, but the model must support steady growth in roles, capability mappings, and multi-role combinations (target: a new role added by editing the registry only, in under 1 hour)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-first delivery**: PASS. Work is anchored to `specs/007-multi-role-assignment/spec.md` before design or coding.
- **Single SDD source of truth**: PASS. This feature directory is the single active source for the multi-role + extensibility change set (features 007 and 008 were merged here; no parallel artifact exists).
- **Vertical slices over horizontal layers**: PASS. The plan groups work around user-visible slices: multi-role assignment, recruiter-plus-expert access, registry-driven role addition, capability mapping, and regression preservation.
- **Contract-first frontend/backend boundaries**: PASS. Phase 1 defines the full contract (`contracts/internal-auth-multirole.openapi.yaml`, v0.2.0) covering auth payloads, role management, landing, and the registry snapshot before implementation.
- **Minimalism and verifiable change**: PASS. The design adds one assignment table, one registry package, and one capability-dependency primitive; it avoids a permission engine, runtime role management, and registry persistence.
- **UI identity**: PASS. Frontend changes extend existing auth/workspace patterns and reuse current design tokens/components; rendering becomes data-driven without new UI systems.
- **Post-design re-check**: PASS. Phase 1 artifacts preserve existing architecture boundaries; new concepts are limited to the assignment table and the in-memory registry.

## Project Structure

### Documentation (this feature)

```text
specs/007-multi-role-assignment/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── dependencies/
│   │   └── auth.py          # capability-aware: require_capability / require_area
│   ├── migrations/          # + migration: role column -> role assignments
│   ├── models/
│   │   ├── user.py          # InternalUser without role column; + InternalRoleAssignment
│   │   └── role_assignment.py
│   ├── roles/               # NEW: declarative registry (models + catalog + validation)
│   │   ├── __init__.py
│   │   ├── models.py        # Pydantic models: Capability, RoleDefinition, RoleRegistry
│   │   ├── catalog.py       # canonical area/action ids + built-in registry data
│   │   └── validation.py    # startup validation: unique codes, known capability refs
│   ├── repositories/
│   │   └── user_repository.py  # assignments CRUD, count by role code (guard)
│   ├── routers/
│   │   ├── auth.py          # auth/me with roles; landing from registry
│   │   ├── internal_users.py    # user management + role assignment endpoints
│   │   └── roles.py         # NEW: GET /api/v1/internal/roles snapshot
│   ├── schemas/
│   │   ├── auth.py          # roles collections; RoleCode instead of enum
│   │   └── roles.py         # registry snapshot response schemas
│   └── services/
│       ├── auth_service.py
│       ├── role_service.py  # NEW: registry access, capability union, retirement guard
│       └── user_admin_service.py
└── tests/
    ├── roles/               # registry validation + capability resolution
    └── api/                 # assignment, gating, landing, snapshot tests

frontend/
├── lib/
│   ├── api.ts               # InternalRole -> string (registry-validated); snapshot client
│   ├── roles.ts             # NEW: registry snapshot types + label/ordering helpers
│   └── auth.ts              # landing-driven routing (getRolePath switch removed)
├── components/auth/
│   ├── internal-user-form.tsx  # role options from registry snapshot
│   ├── recruiter-workspace.tsx # role labels from registry snapshot
│   └── protected-role-page.tsx # area/capability gating from landing payload
└── app/internal/            # landing-driven protected areas

specs/
├── 006-recruiter-auth/          # baseline (current single-role implementation)
└── 007-multi-role-assignment/   # this feature
```

**Structure Decision**: Use the existing web-application split. Backend changes stay inside the current model/repository/service/router/dependency layers; the registry is a new `app/roles/` package because it is a cross-cutting, non-persistence domain concept. Frontend changes stay inside current auth helpers, workspace components, and lib clients. The full contract is documented in this feature directory before implementation.

## Complexity Tracking

No constitution violations currently require justification. The plan deliberately avoids a full permissions engine (union-only capabilities), runtime role management, and DB persistence for the registry to stay minimal while satisfying the extensibility requirements.
