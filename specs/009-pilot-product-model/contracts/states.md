# States: 009-pilot-product-model

## Kanban columns (recruiter board)

1. Пригласили — invited, opened, consented, device_checked, ready, in_interview, interrupted
2. Интервью — submitted, report_processing
3. Отчёт — report_ready (awaiting)
4. Завершены — handed_off, opinion_asked, rejected, closed_by_candidate, expired, declined, consent_revoked, data_deleted

## Three axes

1. Report: processing | ready | updated_extra | expert_reviewed
2. Extra and audit independently
3. Recruiter decision: awaiting | handed_off | rejected | closed_by_candidate | opinion_asked

Handoff blocked while extra/audit open unless recruiter closes with required reason; gap stays visible. Rejected blocks handoff; opinion_asked does not.

## Honest actions

Invite toast: «Ссылка готова. Отправьте её сами.» No fake email. Disabled control has `.disabled-hint`.
