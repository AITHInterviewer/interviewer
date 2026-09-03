# Quickstart: Docker Dev Baseline

## Purpose

Validate the local Docker baseline for `frontend/` and `backend/` using the same service-local artifacts intended for CI reuse.

## Prerequisites

- Docker with Compose support available on the machine
- Access to the repository root
- No conflicting long-lived processes occupying the baseline ports, or an agreed override in local environment files

## Initial Setup

1. Create `frontend/.env` from `frontend/.env.example`.
2. Create `backend/.env` from `backend/.env.example`.
3. Confirm `NEXT_PUBLIC_BACKEND_URL` points to the host-visible backend URL and `BACKEND_INTERNAL_URL` points to the container-visible backend URL.
4. Confirm backend local CORS settings allow requests from the local frontend URL.

## Validation Scenario 1: Build core service artifacts independently

From the repository root:

```bash
docker build -t ainterviewer-frontend-dev ./frontend
docker build -t ainterviewer-backend-dev ./backend
```

Expected outcome:

- Both builds complete successfully.
- No manual dependency installation outside project manifests is required during the build flow.

## Validation Scenario 2: Start the baseline happy path

From the repository root:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Expected outcome:

- `frontend` and `backend` containers start successfully.
- `live-agent` and `evaluation-agent` are not required for success.

## Validation Scenario 3: Verify backend readiness

After startup, request the backend health endpoint.

```bash
curl http://localhost:8000/health
```

Expected outcome:

- Response is HTTP 200.
- Response body matches the contract in [`contracts/frontend-backend-baseline.md`](./contracts/frontend-backend-baseline.md).

## Validation Scenario 4: Verify frontend availability and wiring

1. Open `http://localhost:3000`.
2. Confirm the application shell loads.
3. Run one documented frontend-to-backend smoke interaction for the baseline once implementation adds it.

Expected outcome:

- Frontend is reachable.
- Frontend uses environment-owned backend configuration rather than a hardcoded source value.
- Frontend shows useful diagnostic state when `BACKEND_INTERNAL_URL` is missing or backend is unavailable.

## Validation Scenario 5: Prove CI-style reuse assumptions

Use the same service-local image build inputs in a fresh environment or CI-equivalent shell session.

Expected outcome:

- Builds do not depend on machine-specific package-manager setup outside each project.
- Each service artifact can be built or started without rebuilding the other unless the validation scenario explicitly requires both.

## References

- Spec: [`spec.md`](./spec.md)
- Plan: [`plan.md`](./plan.md)
- Data model: [`data-model.md`](./data-model.md)
- Contract: [`contracts/frontend-backend-baseline.md`](./contracts/frontend-backend-baseline.md)
