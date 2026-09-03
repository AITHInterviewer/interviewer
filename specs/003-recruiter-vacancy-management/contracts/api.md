# API Contract: Рекрутёр — вакансии, интервью, отчёты

Формат — облегчённый OpenAPI-стиль (путь, метод, вход, выход, статусы), не полный YAML —
масштаб контракта (6 эндпоинтов) не оправдывает генерацию файла, который никто не будет
кодогенерировать (см. `research.md`, «Frontend: клиент к backend API»). Все пути — под
префиксом `/api/v1`, требуют заголовок `Authorization: Bearer <jwt>` кроме отмеченных как
public.

Поля сущностей — см. `data-model.md`. Здесь только форма запроса/ответа и коды ошибок,
специфичные для эндпоинта.

## Auth (research.md: логин/пароль + JWT)

### `POST /api/v1/auth/login` — public

Вход: `{email, password}`
Выход `200`: `{access_token, token_type: "bearer"}`
Выход `401`: неверные учётные данные

## Vacancies — US1

### `POST /api/v1/vacancies`

Вход: `{title, description, grade, required_skills[], nice_to_have_skills[]}`
Выход `201`: `Vacancy` со `status = draft`, без вопросов

### `POST /api/v1/vacancies/{id}/questions/generate`

Генерирует базовые вопросы LLM-вызовом (research.md: Anthropic Messages API,
structured output) и **заменяет** текущий список сгенерированных (`source = base_generated`)
вопросов вакансии — вручную добавленные (`source = base_manual`) и отредактированные
(`source = base_edited`) не трогает.

Вход: `{}` (использует уже сохранённые поля вакансии)
Выход `200`: `{questions: Question[], estimated_duration: {min_sec, max_sec}}`
Выход `409`: вакансия уже `ready` (US1 п.4 — генерация до `ready`, не после; повторная
генерация для `ready`-вакансии — вне скоупа этого контракта, требует явного `speckit-clarify`)

### `PATCH /api/v1/vacancies/{id}/questions/{question_id}`

Правка одного вопроса (текст/`skill_tag`/`intent`/`reference_answer`/`format`/`difficulty`/
`estimated_duration_sec`/`order`). Помечает вопрос `source = base_edited`, если был
`base_generated`.

Вход: частичный `Question` (любое подмножество редактируемых полей)
Выход `200`: обновлённый `Question`
Выход `422`: `role = assessment`, но `intent`/`reference_answer`/`skill_tag` очищены (инвариант из `data-model.md`)

### `POST /api/v1/vacancies/{id}/questions` — добавить ручной вопрос

Вход: `Question` (минимум `text`; `skill_tag`/`intent`/`reference_answer` опциональны — при
отсутствии клиент может отдельно вызвать `question-fields/generate`, см. ниже)
Выход `201`: `Question` со `source = base_manual`

### `DELETE /api/v1/vacancies/{id}/questions/{question_id}`

Выход `204`

### `POST /api/v1/vacancies/{id}/questions/{question_id}/fields/generate`

Генерирует `skill_tag`/`intent`/`reference_answer`/`estimated_duration_sec` по уже
введённому `text` ручного вопроса (US1, Acceptance Scenario 3).

Выход `200`: обновлённый `Question`

### `POST /api/v1/vacancies/{id}/publish`

Переводит `Vacancy.status: draft → ready`. Требует непустой список вопросов, у каждого
`role = assessment` — заполненные `intent`/`reference_answer`/`skill_tag` (US1 п.4).

Выход `200`: `Vacancy`
Выход `422`: список вопросов пуст или есть невалидный `assessment`-вопрос

### `GET /api/v1/vacancies/{id}/duration-estimate`

Живой пересчёт диапазона длительности по текущему списку вопросов (раздел 2.1.2) — не
хранится отдельным полем (data-model.md сознательно не добавляет столбец).

Выход `200`: `{min_sec, max_sec, warning: boolean}` — `warning = true`, если `max_sec` >
~2700 (40–45 минут, раздел 2.1.2)

## Interviews — US2, US3

### `POST /api/v1/vacancies/{id}/interviews`

Вход: `multipart/form-data` — `resume_file`, опционально `candidate_name`
Выход `201`: `{interview: Interview, candidate_link: string}` — `candidate_link` содержит
`access_token` в пути под доменом `frontend/`, ведущим в [[004-candidate-interview-flow]]
Выход `422`: вакансия не в статусе `ready`

### `GET /api/v1/vacancies/{id}/interviews`

Таблица кандидатов (US3, Acceptance Scenario 1).

Выход `200`: `Interview[]` с денормализованными `candidate_name`, `status`,
`created_at`, и — если `Evaluation` существует — `{overall_score, verdict}` инлайн; иначе
эти два поля `null` (таблица не должна падать на «в обработке» записях, US3 AS1).

### `GET /api/v1/interviews/{id}/report`

Полный отчёт (US3, Acceptance Scenario 2).

Выход `200`: `{interview: Interview, evaluation: Evaluation | null, recruiter_decision:
RecruiterDecision | null, warmup_answer: {transcript} | null, closing_answer: {transcript}
| null}`
Выход `404`

### `PUT /api/v1/interviews/{id}/decision`

Вход: `{decision: "fits" | "not_fits" | "needs_review"}`
Выход `200`: `RecruiterDecision` (US3, Acceptance Scenario 3 — отдельно от
`Evaluation.verdict`, никогда не выводится автоматически из него)
