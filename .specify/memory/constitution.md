<!--
Sync Impact Report
Version change: 1.0.0 -> 1.0.1
Modified principles:
- IV. Contract-First Frontend/Backend Boundaries -> IV. Contract-First Frontend/Backend Boundaries
- V. Minimalism And Verifiable Change -> V. Minimalism And Verifiable Change
Added sections:
- None
Removed sections:
- None
Follow-up TODOs:
- Extend constitution scope to live-agent, evaluation-agent, and infra in a future amendment.
-->

# AInterviewer Constitution

## Core Principles

### I. Spec-First Delivery

All non-trivial work in `frontend/` and `backend/` MUST begin with Speckit artifacts,
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
active `frontend/` and `backend/` work is `.specify/memory/constitution.md` together
with the active feature directory under `specs/`.

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

This constitution currently governs only `frontend/` and `backend/`.

For `frontend/`, the baseline stack is:
- `Next.js`
- `TypeScript`
- `Tailwind`
- `shadcn/ui`

For `backend/`, the baseline stack is:
- `FastAPI`
- `uv`

Changing the baseline stack for either area MUST be approved through a new or amended
Speckit specification and reflected in the constitution if the change alters ongoing
project-wide standards.

`live-agent/`, `evaluation-agent/`, and `infra/` are currently outside the strict scope
of this constitution and will be added by a later amendment.

## Development Workflow

For non-trivial `frontend/` and `backend/` work, the required sequence is:

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
repository. Every substantial `frontend/` or `backend/` review MUST verify that:

- the work is backed by Speckit artifacts
- the active feature has a clear source of truth under `specs/`
- contracts are updated when interfaces change
- validation expectations are defined and executed

Constitution versioning follows semantic versioning:

- `MAJOR`: incompatible governance changes or removal/redefinition of principles
- `MINOR`: new principle, new mandatory section, or materially expanded governance
- `PATCH`: clarifications, wording improvements, or non-semantic cleanup

Amendments to this constitution MUST document the reason for change and any required
migration in team workflow. Until expanded by amendment, the scope of this constitution
remains limited to `frontend/` and `backend/`.

**Version**: 1.0.1 | **Ratified**: 2026-09-03 | **Last Amended**: 2026-09-03
