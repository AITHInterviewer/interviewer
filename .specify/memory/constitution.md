<!--
Sync Impact Report
Version change: 1.1.0 -> 1.1.1
Modified principles:
- II. Single SDD Source Of Truth -> II. Single SDD Source Of Truth (feature directory list
  corrected: specs/002-docker-dev-baseline/ was created independently of this constitution
  amendment and now takes the 002 prefix; the batch-evaluation-contour feature that
  previously held 002 was renumbered to specs/005-batch-evaluation-contour/ to resolve the
  collision, and is added to the list)
Added sections:
- None
Removed sections:
- None
Follow-up TODOs:
- None outstanding.
-->

# AInterviewer Constitution

## Core Principles

### I. Spec-First Delivery

All non-trivial work in `frontend/`, `backend/`, `live-agent/`, and `evaluation-agent/`
MUST begin with Speckit artifacts,
not direct implementation. The minimum required path is `spec.md` before design or
coding, followed by `plan.md` and `tasks.md` before implementation starts. The only
allowed exceptions are narrowly scoped fixes such as typos, broken imports, or
obviously broken commands that do not change behavior, scope, or interfaces.

Rationale: this keeps product intent, design intent, and implementation intent aligned
before code diverges.

### II. Single SDD Source Of Truth

Speckit is the only active spec-driven development process for this repository.
`openspec/` is legacy and MUST NOT be used for new planning or change tracking. When
code, chat history, and planning artifacts disagree, the authoritative source for
active `frontend/`, `backend/`, `live-agent/`, and `evaluation-agent/` work is
`.specify/memory/constitution.md` together with the relevant feature directory under
`specs/`:

- `specs/001-live-interview-contour/` — `live-agent/`
- `specs/002-docker-dev-baseline/` — local Docker dev startup for `backend/` + `frontend/` (env-driven config, core happy path)
- `specs/003-recruiter-vacancy-management/` — recruiter-facing `backend/` + `frontend/`
- `specs/004-candidate-interview-flow/` — candidate-facing `frontend/` (+ integration with `live-agent/`)
- `specs/005-batch-evaluation-contour/` — `evaluation-agent/`

Each feature directory's `spec.md` MUST stay current with what the corresponding code
actually does, including a plain statement of what is implemented versus still open.
`docs/Архитектура и дизайн MVP.md` remains the product-level design rationale; `specs/`
is the executable, per-feature breakdown derived from it.

Rationale: one active governance system avoids duplicated plans, conflicting task
lists, and silent process drift.

### III. Vertical Slices Over Horizontal Layers

Features MUST be specified, planned, and implemented as independently valuable user
stories. `tasks.md` MUST be organized by user story rather than by technical layer or
team specialty. Each user story MUST be independently testable and demonstrable so that
partial delivery still produces a coherent increment.

Rationale: vertical slices reduce integration risk and make progress visible earlier
than layer-by-layer delivery.

### IV. Contract-First Frontend/Backend Boundaries

Any new or changed interaction between `frontend/` and `backend/` MUST be described in
design artifacts before implementation. Frontend code MUST NOT depend on undocumented
backend payloads, routes, or behavior. Backend code MUST NOT introduce externally
visible request, response, or error-shape changes without corresponding contract and
spec updates.

Rationale: explicit contracts keep both sides evolvable without relying on chat memory
or accidental coupling.

### V. Minimalism And Verifiable Change

The default implementation choice MUST be the smallest correct design that satisfies
the approved specification. New abstractions, helpers, shared layers, and framework
customization MUST be introduced only when they solve a demonstrated need in the
current plan. A change is not complete until the verification steps defined in
`tasks.md` and `quickstart.md` have been executed or explicitly called out as blocked.

Rationale: minimal solutions are easier to validate, easier to revise, and less likely
to create accidental complexity.

## Technology Constraints

This constitution governs `frontend/`, `backend/`, `live-agent/`, and `evaluation-agent/`.

For `frontend/`, the baseline stack is:
- `Next.js`
- `TypeScript`
- `Tailwind`
- `shadcn/ui`

For `backend/`, the baseline stack is:
- `FastAPI`
- `uv`

For `live-agent/`, the baseline stack and non-negotiable decisions are documented in
`live-agent/CLAUDE.md` (control flow is plain Python state machine, not LLM tool-calling;
LLM calls go only through the typed `LiveControlLLM.decide()` contract; model is
`claude-haiku-4-5` via Claude Agent SDK; STT/TTS are self-hosted via Docker). That file is
binding for changes inside `live-agent/` in the same way this section is binding for
`frontend/`/`backend/` — Speckit changes to `specs/001-live-interview-contour/` MUST NOT
silently contradict it.

For `evaluation-agent/`, the baseline stack is:
- `Pydantic` for schemas, kept as an independent copy from `backend/` models (services do
  not share an ORM layer)
- `Redis` for the task queue (declared in dependencies; not yet wired up)
- `httpx` for calls back to the backend API

`infra/` holds deployment and local-stack configuration (Docker Compose, LiveKit egress
config) shared across services. It is not an independently spec-governed feature area —
changes to it MUST stay traceable to whichever feature directory under `specs/` they
support, rather than accumulating undocumented infrastructure drift.

Changing the baseline stack for any governed area MUST be approved through a new or
amended Speckit specification and reflected in this constitution if the change alters
ongoing project-wide standards.

## Development Workflow

For non-trivial work in any governed area, the required sequence is:

1. `speckit-specify`
2. `speckit-clarify` when clarification markers remain or review requires it
3. `speckit-plan`
4. `speckit-tasks`
5. Human review of the generated artifacts
6. `speckit-implement`

Implementation MUST NOT begin before specification and plan review gates are accepted.
If new requirements or scope changes are discovered during implementation, the relevant
specification, plan, and tasks MUST be updated before coding continues.

All active feature work MUST remain traceable to a single feature directory under
`specs/`. Reviewers MUST be able to map implementation back to user stories,
requirements, contracts, and validation steps without relying on undocumented context.

## Governance

This constitution supersedes ad-hoc process decisions for governed areas of the
repository. Every substantial review of a governed area MUST verify that:

- the work is backed by Speckit artifacts
- the active feature has a clear source of truth under `specs/`
- contracts are updated when interfaces change
- validation expectations are defined and executed

Constitution versioning follows semantic versioning:

- `MAJOR`: incompatible governance changes or removal/redefinition of principles
- `MINOR`: new principle, new mandatory section, or materially expanded governance
- `PATCH`: clarifications, wording improvements, or non-semantic cleanup

Amendments to this constitution MUST document the reason for change and any required
migration in team workflow. The scope of this constitution is `frontend/`, `backend/`,
`live-agent/`, and `evaluation-agent/`; extending it to further areas requires a further
amendment.

**Version**: 1.1.1 | **Ratified**: 2026-09-03 | **Last Amended**: 2026-09-03
