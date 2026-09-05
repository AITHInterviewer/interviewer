# States: 009-pilot-product-model

## Kanban columns (recruiter board)

1. Приглашены — invited, opened, consented, device_checked, ready, expired, declined
2. Проходят интервью — in_interview
3. Нужны действия — interrupted, extra/audit open, consent_revoked
4. Готовы к решению — report_ready и нет открытых уточнений
5. Завершены — handed_off, rejected, closed_by_candidate, data_deleted

## Three axes

1. Report: processing | ready | updated_extra | expert_reviewed
2. Extra and audit independently
3. Recruiter decision: awaiting | handed_off | rejected | closed_by_candidate

Handoff blocked while extra/audit open unless recruiter closes with required reason; gap stays visible.

## Honest actions

Invite toast: «Ссылка готова. Отправьте её сами.» No fake email. Disabled control has `.disabled-hint`.
