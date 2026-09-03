# Contract: Frontend/Backend Local Dev Baseline

## Purpose

Define the minimum stable boundary required for the local Docker baseline between `frontend/` and `backend/`.

## Startup Boundary

- The baseline startup path includes `frontend` and `backend` as mandatory services.
- The canonical baseline entrypoint is a dedicated root compose flow for core services only.
- `live-agent` and `evaluation-agent` are outside the baseline happy path and must not be prerequisites for baseline success.
- Frontend and backend remain separate build and runtime units so that each can be reused independently in CI or separate hosting flows.

## Configuration Boundary

| Service | Owned configuration | Requirement |
|---------|---------------------|-------------|
| Frontend | Local `.env` file in `frontend/` | Owns `NEXT_PUBLIC_BACKEND_URL` for browser access and `BACKEND_INTERNAL_URL` for container-to-container access. |
| Backend | Local `.env` file in `backend/` | Owns CORS and other mutable backend runtime settings needed for local FE-to-BE access. |

Rules:

- Mutable cross-service addresses must be sourced from project-local environment files, not hardcoded in source files.
- Each service image must build from dependency manifests and lockfiles stored inside its own project directory.

## HTTP Smoke Boundary

- **Endpoint**: `GET /health`
- **Provider**: backend
- **Consumer**: developer validation flow, and optionally frontend integration checks
- **Expected response**:

```json
{
  "status": "ok"
}
```

## Failure Expectations

- If backend is unavailable, the failure must be diagnosable through the documented baseline validation flow without editing source code.
- If configuration is missing, the startup guide must identify where the missing value belongs.

## Out Of Scope

- Future domain endpoints beyond `GET /health`
- AI-service traffic and evaluation-agent contracts
- Production-grade multi-service orchestration outside the baseline feature
