# Routes: 009-pilot-product-model

## Staff

- Recruiter: `/vacancies`, `/vacancies/new`, `/vacancies/[id]`, `.../rubric?from=recruiter`, `.../questions?from=recruiter`, `.../settings`, `.../candidates/[cid]`, `/brief/[id]`
- Expert: `/expert`, `/expert/queue`, `/vacancies/[id]/rubric|questions|approve`, `/audit/[vacancyId]`, `/audit/[vacancyId]/[candidateId]`
- Manager: `/manager`, `/manager/[cid]`, `/brief/[id]`
- Admin: `/internal/users` (не решения по кандидатам)
- `/internal/hiring-manager` → redirect `/manager`

Нет в меню: `/overview`, `/candidates`. Demo board не в основном nav.

## Candidate `/i/[token]`

invite → `/consent` → `/check` → `/rules` → `/practice` → `/live` (LiveKit) → `/done`

Также: `/resume`, `/extra/[id]`, `/transcript`, `/request`, `/i/expired`

Не делаем живыми: `/q/[n]`, `/result` (внутренняя оценка). `/interview/[token]` редирект в оболочку.

## API (additive)

- `POST /api/v1/vacancies/{id}/send-to-expert` recruiter, `extracted|changes_requested` → `calibration`
- `POST /api/v1/vacancies/{id}/request-changes` expert, `calibration` → `changes_requested` (body `reason`)
- `POST /api/v1/vacancies/{id}/approve` expert → `approved` + RubricVersion
- `POST /api/v1/vacancies/{id}/activate` recruiter, `approved` → `active`
- `POST /api/v1/vacancies/{id}/pause|resume|archive` recruiter
- `POST /interview/{token}/consent` → product_state `consented`
- `POST /interview/{token}/progress` body `{product_state}` (opened, device_checked, ready, …)
- Clarifications / handoff / opinion / report endpoints under `/api/v1/interviews/{id}/...`

`create_interview` только при `active` → 409/422 иначе. `candidate_link` оканчивается на `/i/{token}`.
