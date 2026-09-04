# Contract: Consent-screen info (REST)

Восполняет пробел, обнаруженный на этапе `/speckit-implement`: `tasks.md` T012 ссылался
на этот эндпоинт, но контракт не был зафиксирован в Phase 1 — добавлено здесь, до
реализации (Constitution IV — contract-first, ничего не должно уйти в код без контракта).

`GET /interview/{access_token}`

Публичный (без аккаунта — кандидат приходит по токену), read-only. Отдаёт данные для
экрана согласия (`spec.md`, US1, Acceptance Scenario 1) — не отдаёт сами вопросы (те
приходят только через control-канал, `contracts/control-channel.md`, после того как
`live-agent` начал сессию — до этого момента кандидат их не должен видеть).

## Response `200`

```json
{
  "interview_id": "int-42",
  "status": "created",
  "vacancy_title": "Backend-разработчик",
  "questions_total": 6,
  "estimated_duration_min": {"min": 25, "max": 40}
}
```

- `status` — `created | in_progress | completed` (см.
  [[003-recruiter-vacancy-management]], `data-model.md`, `Interview.status`).
  `completed` — frontend показывает отдельный экран «интервью уже пройдено» вместо
  согласия (см. `spec.md`, Edge Cases — открытый вопрос повторного посещения; для
  консент-экрана минимум — не притворяться, что можно начать заново).
- `estimated_duration_min` — диапазон из [[003-recruiter-vacancy-management]] (раздел
  2.1.2 архитектурного документа, живой пересчёт по списку вопросов на момент создания
  интервью).

## Errors

| Код | Когда |
|---|---|
| `404` | `access_token` не найден |

## Статус реализации

Реализовано поверх минимального DB-слоя [[003-recruiter-vacancy-management]] (только
схема `Recruiter`/`Vacancy`/`Question`/`Interview`, без CRUD рекрутёра — см.
`app/services/interview_repository.py`). Временная in-memory заглушка
(`interview_directory.py`) удалена. `estimated_duration_min` считается по формуле раздела
2.1.2 архитектурного документа с двумя параметрами-плейсхолдерами (фиксированный оверхед,
среднее по адаптивному бюджету), не сверенными с 003 — см. docstring
`interview_repository.py`.
