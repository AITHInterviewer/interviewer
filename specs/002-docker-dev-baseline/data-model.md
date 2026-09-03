# Data Model: Docker Dev Baseline

## Local Dev Baseline

- **Purpose**: Represents the supported local startup path for core development.
- **Fields**:
  - `name`: canonical baseline name
  - `included_services`: list of mandatory core services
  - `excluded_services`: list of non-core services kept out of the happy path
  - `startup_entrypoint`: documented command path used to launch the baseline
  - `validation_steps`: ordered smoke checks proving readiness
- **Relationships**:
  - owns multiple `Core Runtime Artifact` records
  - references multiple `Project Environment File` records
  - depends on one `Core Service Connection`
- **Validation rules**:
  - must include `frontend` and `backend`
  - must exclude `evaluation-agent` from the happy path
  - must define at least one post-start validation step

## Core Runtime Artifact

- **Purpose**: Represents the buildable runtime package for one core service.
- **Fields**:
  - `service_name`: `frontend` or `backend`
  - `dockerfile_path`: repository path for the service image definition
  - `build_context`: repository path used for image build inputs
  - `dependency_manifest_paths`: authoritative dependency declaration files
  - `runtime_entrypoint`: command used when the container starts
  - `reuse_targets`: local dev, CI, separate hosting
- **Relationships**:
  - belongs to one `Local Dev Baseline`
  - consumes zero or more `Project Environment File` values at runtime
- **Validation rules**:
  - each core service has exactly one primary runtime artifact for this feature
  - dependency manifests and lockfiles must live under the same service directory as the artifact
  - artifact must be buildable without host-specific dependency bootstrap steps

## Project Environment File

- **Purpose**: Represents mutable runtime configuration for a single project.
- **Fields**:
  - `project_name`: `frontend` or `backend`
  - `file_path`: local `.env` path
  - `template_path`: example source for first-run creation
  - `variables`: documented configuration keys owned by that project, including separate public and internal backend URLs for frontend
  - `override_scope`: local dev defaults versus machine-specific overrides
- **Relationships**:
  - belongs to one `Local Dev Baseline`
  - supplies runtime values to one or more `Core Runtime Artifact` records
- **Validation rules**:
  - each core project must have one documented local environment file path
  - mutable addresses or cross-service URLs cannot exist only as hardcoded source values

## Core Service Connection

- **Purpose**: Represents the required local integration path from frontend to backend.
- **Fields**:
  - `source_service`: frontend
  - `target_service`: backend
  - `base_url_source`: environment-owned backend URL for frontend use
  - `smoke_endpoint`: backend health endpoint used for baseline verification
  - `failure_visibility`: expected way developers observe misconfiguration or backend unavailability
- **Relationships**:
  - referenced by one `Local Dev Baseline`
  - connects two `Core Runtime Artifact` records
- **Validation rules**:
  - the connection must not require source-code edits to change the backend target
  - the backend verification endpoint must be reachable through the running backend service

## State Transitions

### Local Dev Baseline

- `defined` → `configured` when required `.env` files exist
- `configured` → `built` when both core runtime artifacts build successfully
- `built` → `running` when both containers start
- `running` → `validated` when frontend availability and backend health checks succeed

### Core Runtime Artifact

- `declared` → `buildable` when dependency manifests and build definition are present
- `buildable` → `running` when container starts successfully
- `running` → `reusable` when the same artifact can be used in local and CI validation flows
