# Data model: 009-pilot-product-model

## Vacancy.status

`draft | extracted | calibration | changes_requested | approved | active | paused | archived`

Миграция с main: `pending_review` → `calibration`, `ready` → `active` (чтобы уже задеплоенные инвайты не сломались). Новый флоу после approve пишет `approved`, не `active`.

Владелец следующего шага:

- draft / extracted / changes_requested / approved / paused / archived → recruiter
- calibration → expert

## RubricVersion

- `id`, `vacancy_id`, `version_number`, `approved_at`, `approved_by_id`, snapshot JSON (title, skills, question ids/texts)
- Interview хранит `rubric_version_id` (nullable до первой активации)

## Interview.product_state

Технический `status` (`created | in_progress | completed | processing_failed`) не ломаем — его пишет LiveKit/WS.

Новая колонка `product_state`:

`invited | opened | consented | device_checked | ready | in_interview | interrupted | submitted | report_processing | report_ready | expired | declined | consent_revoked | data_deleted`

`consented_at` datetime nullable.

## ClarificationRequest

- `type`: `extra | expert_audit`
- `status`: extra: `requested | received | accounted | expired | closed`; audit: `requested | in_progress | completed | withdrawn`
- `interview_id`, `created_by_id`, `close_reason` optional
- extra: `access_token` для `/i/{interview_token}/extra/{id}`

## Handoff

- `interview_id`, `from_recruiter_id`, `to_manager_id`, `summary`, `created_at`
- Recruiter decision axis: `awaiting | handed_off | rejected | closed_by_candidate`

## ManagerOpinionGrant

- `interview_id`, `manager_id`, `granted_by_id`, `expires_at` nullable
- Не означает «прошёл отбор»

## Report (MVP)

JSON на interview: `report_status` (`processing | ready | updated_extra | expert_reviewed`), `assessments[]` (`requirement`, `status`, `evidence`, `origin`). Без молчаливого пересчёта. Пока нет evaluation-agent — `processing` честно.
