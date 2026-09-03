# Research: Docker Dev Baseline

## Decision 1: Keep frontend and backend as separate Docker build units

- **Decision**: Preserve independent Dockerfiles and independent image builds for `frontend/` and `backend`, and treat compose as orchestration rather than the source of a shared runtime artifact.
- **Rationale**: The specification requires reuse in local development, CI, and possible future deployment on different machines. Separate images minimize coupling, allow isolated rebuilds, and match the current repository split.
- **Alternatives considered**:
  - Single combined image for frontend and backend: rejected because it blocks independent hosting and produces a deployment unit that does not match the service boundaries.
  - One Dockerfile generating both services with multiple targets only: rejected because it still centralizes unrelated service build concerns and makes downstream reuse less direct.

## Decision 2: Build each image only from project-owned dependency manifests and lockfiles

- **Decision**: Treat `frontend/package.json` with `package-lock.json` and `backend/pyproject.toml` with `uv.lock` as the authoritative inputs for image dependency installation.
- **Rationale**: The user explicitly requires that necessary libraries and package-management setup already live in each project so the images can be reused without rewriting setup for Docker or CI. Existing manifests already align with the governed stack and should remain the single source of truth.
- **Alternatives considered**:
  - Installing extra dependencies ad hoc in CI scripts: rejected because it creates drift between local and CI builds.
  - Relying on host-installed tooling during image builds: rejected because it breaks reproducibility and violates the self-contained build requirement.

## Decision 3: Use project-local environment files for mutable runtime configuration

- **Decision**: Keep mutable local configuration in service-local `.env` files and example templates, with compose loading those files rather than hardcoding addresses in source code. For frontend, separate the browser-visible backend URL from the container-internal backend URL.
- **Rationale**: The baseline must avoid hardcoded runtime values while still making frontend-to-backend integration visible and easy to override. Service-local `.env` ownership is the least disruptive path and already matches the backend settings pattern.
- **Alternatives considered**:
  - Hardcoded compose environment only: rejected because it hides editable defaults and weakens per-project configuration ownership.
  - Root-only environment file for all services: rejected because it couples independent services and makes separate hosting reuse less natural.

## Decision 4: Define a minimal explicit frontend/backend contract around health and base URL wiring

- **Decision**: Document the local FE-to-BE contract as one configuration boundary plus one runtime HTTP smoke boundary: frontend resolves the backend base URL from environment, backend exposes `GET /health`, and successful baseline verification depends on both.
- **Rationale**: The constitution requires contract-first treatment for FE/BE interactions. The current product surface is minimal, so the contract should stay small and verifiable.
- **Alternatives considered**:
  - Deferring contract documentation until richer application APIs exist: rejected because even the startup baseline already depends on a real frontend/backend boundary.
  - Documenting every future API now: rejected because it would introduce speculative scope.

## Decision 5: Exclude AI-oriented services from the baseline while preserving wider compose compatibility

- **Decision**: The happy path for this feature will start only core services needed for local UI and API development through a dedicated root baseline compose entrypoint, while broader multi-service compositions remain separate and optional.
- **Rationale**: `evaluation-agent` is explicitly known to be outside the stable startup path today, and AI services are out of scope for the constitution-governed work area. This reduces false-negative startup failures and keeps the baseline focused.
- **Alternatives considered**:
  - Continue using a root startup path that includes all services: rejected because it is already known to fail for expected reasons unrelated to frontend/backend work.
  - Reusing only per-service compose files without a single baseline entrypoint: rejected because it weakens the onboarding and CI happy path.
  - Remove non-core compose files entirely: rejected because wider repository use cases still need them.

## Decision 6: Validate through the same commands and images intended for CI reuse

- **Decision**: Quickstart validation should prove that baseline commands, service-local image builds, and smoke checks all run against the same Docker artifacts intended for CI.
- **Rationale**: The main risk is local-only success masking CI breakage. Validation must therefore exercise the reusable images directly instead of relying on host-native dev commands alone.
- **Alternatives considered**:
  - Validating only host-based `npm`/`uv` workflows: rejected because it does not prove image completeness.
  - Validating only root-level compose expansion: rejected because it does not isolate the core baseline contract.
