# Implementation Plan: Docker Dev Baseline

**Branch**: `[002-docker-dev-baseline]` | **Date**: 2026-09-03 | **Spec**: [`specs/002-docker-dev-baseline/spec.md`](./spec.md)

**Input**: Feature specification from `/specs/002-docker-dev-baseline/spec.md`

## Summary

Establish a reproducible local development baseline where `frontend/` and `backend/` start via Docker, the frontend is wired to the local backend by default, AI-oriented services stay outside the happy path, and each core service ships as a separate reusable image with self-contained dependency metadata suitable for local use, CI, and future independent hosting.

## Technical Context

**Language/Version**: Frontend `TypeScript` on `Node 22`; Backend `Python 3.12`

**Primary Dependencies**: Frontend `Next.js`, `React`, `Tailwind`, `shadcn/ui`; Backend `FastAPI`, `pydantic-settings`, `uv`, `uvicorn`

**Storage**: Local environment files only for this baseline; no new persistent application storage in scope

**Testing**: Frontend `npm run build` and startup verification; Backend `pytest` for health endpoint; Docker/Compose validation through build and runtime smoke checks

**Target Platform**: Docker Compose for local development and Linux-based CI runners building the same images

**Project Type**: Web application with separate frontend and backend services

**Performance Goals**: Core services become available quickly enough to satisfy the spec startup success criteria and support routine local UI-to-API checks

**Constraints**: Separate Dockerfiles and images for frontend/backend; happy path excludes `live-agent/` and `evaluation-agent/`; `.env` files must own mutable runtime configuration; frontend must distinguish browser-visible and container-visible backend URLs; each service image must build from project-contained dependency declarations and lockfiles without host-specific setup

**Scale/Scope**: Two core services, one dedicated root baseline orchestration path, one existing backend health contract, and one frontend-to-backend base URL integration path

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-First Delivery**: PASS. Work is derived from `spec.md` and current clarification history.
- **Single SDD Source Of Truth**: PASS. All design artifacts stay under `specs/002-docker-dev-baseline/`.
- **Vertical Slices Over Horizontal Layers**: PASS. Plan stays centered on independently demonstrable startup slices: baseline launch, FE-to-BE wiring, and environment-driven configuration.
- **Contract-First Frontend/Backend Boundaries**: PASS with required artifact. This plan creates an explicit local startup and HTTP boundary contract in `contracts/` before implementation.
- **Minimalism And Verifiable Change**: PASS. Design limits scope to existing `frontend/` and `backend/` services, reuses current stacks, and defines quickstart verification before implementation.

**Post-Design Re-check**:

- PASS. Design keeps the change within governed `frontend/` and `backend/` areas.
- PASS. The selected baseline entrypoint is additive and does not redefine the broader repository orchestration.
- PASS. The plan preserves explicit FE/BE contracts, separate runtime artifacts, and verifiable quickstart steps.

## Project Structure

### Documentation (this feature)

```text
specs/002-docker-dev-baseline/
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
│   ├── config.py
│   ├── main.py
│   └── routers/
│       └── health.py
├── tests/
│   └── test_health.py
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
└── uv.lock

frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── interview/[token]/page.tsx
├── components/
│   └── ui/button.tsx
├── Dockerfile
├── docker-compose.yml
├── package.json
└── package-lock.json

infra/
└── docker-compose.yml

docker-compose.yml
docker-compose.dev.yml
```

**Structure Decision**: Use the existing web-application split with independent `frontend/` and `backend/` build contexts, service-local Dockerfiles, service-local dependency manifests and lockfiles, and a dedicated root baseline entrypoint `docker-compose.dev.yml` that composes only the core services while leaving broader multi-service stacks available separately.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
