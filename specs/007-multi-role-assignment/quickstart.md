# Quickstart: Extensible Multi-Role Internal Users

## Purpose

Validate end-to-end that internal users can hold multiple roles on one account, that recruiter-plus-expert access works in one session, that new roles can be added through the declarative registry only, and that existing single-role flows do not regress.

## Prerequisites

- Backend dependencies installed and backend test database available.
- Frontend dependencies installed.
- Environment configured as described in `backend/.env.example` and `frontend/.env.example`.
- Current feature artifacts available:
  - [spec.md](./spec.md)
  - [data-model.md](./data-model.md)
  - [contracts/internal-auth-multirole.openapi.yaml](./contracts/internal-auth-multirole.openapi.yaml)

## Suggested Validation Sequence

### 1. Run backend automated checks

```bash
uv run pytest backend/tests
```

**Expected outcome**:
- Registry validation tests pass (duplicate codes, unknown capability refs, missing built-in roles rejected).
- Role assignment tests cover creation, duplicate prevention, zero-role rejection, and unknown-code rejection.
- Capability gating tests cover recruiter-plus-expert allow and recruiter-only deny for question editing.

### 2. Run frontend automated checks

```bash
npm --prefix frontend test
```

**Expected outcome**:
- Auth helper and route tests pass with `roles` collections and landing-driven routing.
- Assignment form renders role options from the registry snapshot; no hardcoded role options remain.

### 3. Start the application locally

```bash
docker compose -f docker-compose.dev.yml up --build
```

**Expected outcome**:
- Frontend and backend start successfully; startup fails fast with a clear error if the registry is malformed.
- Internal auth routes and the registry snapshot endpoint are reachable.

### 4. Validate recruiter self-registration

1. Open the registration page.
2. Create a recruiter account.
3. Confirm sign-in completes and the user reaches the internal protected area.

**Expected outcome**:
- One internal account is created.
- The returned user payload includes a non-empty `roles` list containing `recruiter`.

### 5. Validate multi-role assignment on an existing account

1. As a recruiter, create a managed internal user with one initial role.
2. Update that user so the same account holds a second supported role.
3. Re-open the user list and user detail flow.

**Expected outcome**:
- No second account is created for the same person.
- The managed user is shown once with the full assigned role set.
- Duplicate role assignment attempts do not create repeated roles.
- Removing the final remaining role is rejected.

### 6. Validate recruiter-plus-expert access in one session

1. Assign both `recruiter` and `expert` to the same internal account.
2. Sign in with that account.
3. Open the recruiter workspace.
4. Open the question-editing flow reserved for expert-capable users.

**Expected outcome**:
- The account signs in once.
- Recruiter workspace remains accessible.
- Expert-gated question editing is accessible in the same session.

### 7. Validate negative authorization cases

1. Sign in as a single-role recruiter without the question-editing capability.
2. Attempt the expert-only question-editing action.

**Expected outcome**:
- Expert-only action is denied (403).
- The user's existing allowed access remains intact.

### 8. Validate non-regression for single-role users

1. Sign in as an existing recruiter-only user.
2. Sign in as an existing expert-only or hiring-manager-only user.
3. Navigate to their protected area.

**Expected outcome**:
- Single-role users still reach their normal protected entry flow.
- No extra role-selection ceremony is required for users who only have one role.
- Accounts migrated from the old single-role column work without recreation.

### 9. Validate registry-only role addition (SC-006)

1. In the registry module (`backend/app/roles/catalog.py`), add one capability (e.g. `area.methodology`) and one role definition (code `methodologist`, title `Methodologist`, assignable, capabilities including the new area). Change nothing else.
2. Restart the backend.
3. Call `GET /api/v1/internal/roles` with any signed-in user's token.

**Expected outcome**:
- Startup succeeds; the snapshot lists the new role ordered by `sort_order`.
- The assignment flow accepts the new role; landing for that user exposes the declared area.
- No code outside the registry module was modified.

### 10. Validate registry guard rails (SC-008, FR-024)

1. Temporarily introduce a duplicate role code or an unknown capability reference in the registry; restart.

**Expected outcome**: startup fails with a clear error naming the violation; no partial registry.
2. Attempt to retire a registry code while an assignment for it exists (role-management guard).

**Expected outcome**: rejection until all assignments of that code are removed.
3. Submit an assignment request with an unknown role code.

**Expected outcome**: 400 with a clear error.

### 11. Verify no hardcoded role comparisons remain (SC-007)

```bash
# Backend: access decisions must go through capability dependencies
grep -rn "role is\|role ==\|== InternalUserRole\|!= InternalUserRole" backend/app/routers backend/app/dependencies
# Frontend: no role-driven switches for access or routing
grep -rn "getRolePath\|expectedRole" frontend/app frontend/components frontend/lib
```

**Expected outcome**: no matches for backend role-equality access checks; remaining frontend matches only use landing-payload data (no hardcoded role→route switch). Fix and re-run suites if any straggler is found.

## Evidence to Capture

- Backend and frontend test run outputs.
- One successful auth response with `roles`.
- One successful role update response.
- One denied expert-only action for a non-capable user.
- Registry snapshot response including a test-only added role.
- Startup failure output for one malformed registry variant.

## Exit Criteria

- Multi-role assignment works on one internal account.
- Recruiter-plus-expert users can use both access domains in one session.
- A new role is added by registry edit only, without touching sign-in/authorization code.
- Malformed registries fail startup; role retirement guard works.
- Existing single-role flows still pass without additional setup.
- API responses and frontend behavior match the documented contract.
