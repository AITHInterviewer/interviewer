# Phase 1 Data Model: Рекрутёр — вакансии, интервью, отчёты

Источник истины по семантике полей — `docs/Архитектура и дизайн MVP.md`, раздел 4;
здесь — те же сущности, переложенные под SQLAlchemy-таблицы и явные ограничения для этой
фичи. Поля, принадлежащие [[001-live-interview-contour]]/[[005-batch-evaluation-contour]]
(генерация adaptive-вопросов в рантайме, заполнение `Evaluation` из батч-пайплайна) здесь
только объявляются как схема — их заполняет не эта фича.

## Recruiter

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `email` | text | unique, not null |
| `name` | text | not null |
| `password_hash` | text | not null |
| `created_at` | timestamptz | default now() |

Без `organization_id` — см. [[constitution]], Technology Constraints и раздел 4/10
архитектурного документа (многотенантность сознательно не закладывается).

## Vacancy

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `recruiter_id` | UUID FK → recruiter.id | not null |
| `title` | text | not null |
| `description` | text | not null |
| `grade` | text | not null (свободный текст в MVP — junior/middle/senior и т.п., без справочника, раздел 10) |
| `required_skills` | text[] | not null, default `[]` |
| `nice_to_have_skills` | text[] | not null, default `[]` |
| `status` | enum(`draft`, `ready`) | default `draft` |
| `created_at` | timestamptz | default now() |

Переход `draft → ready` — только явным действием «Сохранить» (US1, Acceptance Scenario 5).

## Question

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `vacancy_id` | UUID FK → vacancy.id | not null |
| `interview_id` | UUID FK → interview.id | nullable — null для базовых вопросов вакансии, заполнено для `dynamic` (см. [[001-live-interview-contour]]) |
| `text` | text | not null |
| `order` | int | not null (порядок среди базовых вопросов вакансии) |
| `skill_tag` | text[] | not null, default `[]`; пусто допустимо только для `role != assessment` |
| `intent` | text | nullable (обязателен для `role = assessment`, валидируется на уровне API, не БД) |
| `reference_answer` | text | nullable (обязателен для `role = assessment`, см. выше) |
| `format` | enum(`voice`, `code_review_verbal`, `live_coding`) | default `voice` |
| `role` | enum(`assessment`, `warmup`, `closing`) | default `assessment` |
| `difficulty` | enum(`baseline`, `stretch`) | default `baseline` |
| `estimated_duration_sec` | int | not null |
| `stimulus` | jsonb | nullable — `{type: code\|sql\|schema, content, language}` |
| `source` | enum(`base_generated`, `base_edited`, `base_manual`, `dynamic`) | not null |
| `dynamic_trigger` | enum(`clarification`, `contradiction_check`, `drill_down`, `leading_hint`, `resume_inspired`) | nullable, только для `source = dynamic` |
| `parent_question_id` | UUID FK → question.id | nullable |

Эта фича (003) владеет CRUD для `interview_id IS NULL` записей (базовые вопросы вакансии,
US1). Записи с `interview_id IS NOT NULL` создаёт [[001-live-interview-contour]] — 003
только читает их для отчёта (US3), не пишет.

**Инвариант (валидируется в API, не в БД-constraint — избегаем сложных CHECK-выражений
на MVP)**: `role = assessment` ⇒ `intent IS NOT NULL AND reference_answer IS NOT NULL AND
skill_tag <> '{}'` (раздел 5, п.1).

## Interview

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `vacancy_id` | UUID FK → vacancy.id | not null |
| `candidate_name` | text | nullable |
| `resume_file_url` | text | not null (ключ объекта в MinIO) |
| `access_token` | text | unique, not null; криптографически случайный (см. `contracts/`, не UUID v4 по порядку создания — избегаем предсказуемости по времени) |
| `status` | enum(`created`, `in_progress`, `completed`, `processing_failed`) | default `created` |
| `dynamic_questions_used` | int | default 0 |
| `created_at` | timestamptz | default now() |
| `completed_at` | timestamptz | nullable |

`status` переходы `in_progress`/`completed`/`processing_failed` управляются
[[001-live-interview-contour]]/[[005-batch-evaluation-contour]], не этой фичей — 003
только читает статус для таблицы (US3).

## Evaluation

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `interview_id` | UUID FK → interview.id | unique, not null (один результат на интервью) |
| `summary_intro` | text | nullable |
| `per_question` | jsonb | `[{question_id, skill_scores: [{skill_tag, score, rationale}], quotes: [], confidence, answered_with_hint}]` |
| `overall_score` | numeric | nullable |
| `verdict` | enum(`fits`, `not_fits`, `needs_review`) | nullable |
| `confirmed_skills` | text[] | default `[]` |
| `unconfirmed_skills` | text[] | default `[]` |
| `contradictions_found` | jsonb | `[{quote_a, quote_b, description}]`, default `[]` |
| `strengths` | text[] | default `[]` |
| `risks` | text[] | default `[]` |
| `summary_conclusion` | text | nullable |
| `model_version` | text | nullable |
| `prompt_version` | text | nullable |
| `generated_at` | timestamptz | nullable |

Пишет [[005-batch-evaluation-contour]] целиком; 003 определяет схему и читает для US3.
До готовности батч-воркера строки засеиваются вручную для демонстрации отчёта (см.
`quickstart.md`).

## RecruiterDecision

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `interview_id` | UUID FK → interview.id | unique, not null |
| `decision` | enum(`fits`, `not_fits`, `needs_review`) | not null |
| `decided_at` | timestamptz | default now() |

Пишется только явным действием рекрутёра (US3, Acceptance Scenario 3) — никогда не
копируется автоматически из `Evaluation.verdict` (раздел 6).

## Relationships

```
Recruiter 1───* Vacancy 1───* Question (interview_id IS NULL)
Vacancy 1───* Interview 1───* Question (interview_id IS NOT NULL, adaptive)
Interview 1───1 Evaluation
Interview 1───1 RecruiterDecision
Question 0───1 Question (parent_question_id, self-reference для adaptive)
```

## State Transitions

- `Vacancy.status`: `draft → ready` (US1, необратимо в 003 — повторное редактирование
  после `ready` не описано в spec, см. Edge Cases в `spec.md`, требует `speckit-clarify`
  при следующей итерации, если понадобится).
- `Interview.status`: `created → in_progress → completed | processing_failed` — переходы
  вне 003, только чтение.
