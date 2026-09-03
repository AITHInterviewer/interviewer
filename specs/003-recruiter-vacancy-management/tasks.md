---

description: "Task list for feature implementation"
---

# Tasks: Рекрутёр — вакансии, интервью, отчёты

**Input**: Design documents from `/specs/003-recruiter-vacancy-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: не запрошены явно в `spec.md` — отдельных test-first задач нет; проверка —
`quickstart.md` (T041) плюс существующий backend-паттерн `pytest`/`ruff` из CI остаётся в
силе для нового кода (см. `backend/README.md`, не дублируется отдельными тасками здесь).

**Organization**: задачи сгруппированы по user story из `spec.md` (US1/US2/US3, все
Priority P1 — независимо тестируемы и демонстрируемы по отдельности).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Добавить зависимости `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `boto3`, `anthropic`, `pypdf`, `python-docx`, `passlib[bcrypt]`, `python-jose[cryptography]` в `backend/pyproject.toml` (см. `plan.md`, Technical Context)
- [ ] T002 Инициализировать Alembic в `backend/app/migrations/` с async-совместимым `env.py`
- [ ] T003 [P] Добавить `database_url`, `s3_endpoint`/`s3_bucket_resumes`/`s3_access_key`/`s3_secret_key`, `anthropic_api_key`, `jwt_secret` в `backend/app/config.py` и `backend/.env.example`
- [ ] T004 [P] Создать `frontend/lib/api.ts` — тонкая `fetch`-обёртка с базовым URL и хранением JWT (см. `research.md`, «Frontend: клиент к backend API»)

**Checkpoint**: зависимости и конфиг на месте, миграции можно генерировать

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: ни одна user story не может начаться до завершения этой фазы

- [ ] T005 Создать async SQLAlchemy engine/session factory в `backend/app/db.py`
- [ ] T006 [P] ORM-модель `Recruiter` в `backend/app/models/recruiter.py` (см. `data-model.md`)
- [ ] T007 [P] ORM-модель `Vacancy` в `backend/app/models/vacancy.py`
- [ ] T008 [P] ORM-модель `Question` в `backend/app/models/question.py` (включая self-FK `parent_question_id`)
- [ ] T009 [P] ORM-модель `Interview` в `backend/app/models/interview.py`
- [ ] T010 [P] ORM-модель `Evaluation` в `backend/app/models/evaluation.py`
- [ ] T011 [P] ORM-модель `RecruiterDecision` в `backend/app/models/recruiter_decision.py`
- [ ] T012 Сгенерировать первую Alembic-миграцию по моделям T006–T011 в `backend/app/migrations/versions/`
- [ ] T013 Реализовать `get_current_recruiter` (JWT dependency) в `backend/app/services/auth.py` (см. `research.md`, «Backend: авторизация рекрутёра»)
- [ ] T014 Реализовать `POST /api/v1/auth/login` в `backend/app/routers/auth.py` (см. `contracts/api.md`)
- [ ] T015 Подключить `auth`-роутер в `backend/app/main.py`; зарезервировать подключение `vacancies`/`interviews` роутеров (наполняются в US1–US3)

**Checkpoint**: схема БД и авторизация готовы — можно параллельно вести US1/US2/US3

---

## Phase 3: User Story 1 — Вакансия и генерация вопросов (Priority: P1) 🎯 MVP

**Goal**: рекрутёр создаёт вакансию, получает LLM-сгенерированные вопросы, редактирует их,
видит живой пересчёт длительности, публикует вакансию (`spec.md`, US1)

**Independent Test**: `quickstart.md`, раздел «US1» — создать вакансию через API, получить
непустой список вопросов с обязательными полями, опубликовать

### Implementation for User Story 1

- [ ] T016 [P] [US1] Pydantic-схемы `VacancyCreate`/`VacancyOut`/`QuestionOut`/`QuestionUpdate` в `backend/app/schemas/vacancy.py` (по `contracts/api.md`)
- [ ] T017 [US1] `POST /api/v1/vacancies` в `backend/app/routers/vacancies.py`
- [ ] T018 [US1] Сервис генерации вопросов (Anthropic Messages API, structured output) в `backend/app/services/question_generation.py` (см. `research.md`)
- [ ] T019 [US1] `POST /api/v1/vacancies/{id}/questions/generate` — заменяет `source=base_generated` вопросы, не трогает `base_manual`/`base_edited`
- [ ] T020 [US1] `PATCH /api/v1/vacancies/{id}/questions/{question_id}` — с валидацией инварианта `role=assessment` ⇒ `intent`/`reference_answer`/`skill_tag` заполнены (`data-model.md`)
- [ ] T021 [US1] `POST /api/v1/vacancies/{id}/questions` — добавление ручного вопроса (`source=base_manual`)
- [ ] T022 [US1] `DELETE /api/v1/vacancies/{id}/questions/{question_id}`
- [ ] T023 [US1] `POST /api/v1/vacancies/{id}/questions/{question_id}/fields/generate` — генерация `skill_tag`/`intent`/`reference_answer`/`estimated_duration_sec` по тексту ручного вопроса
- [ ] T024 [US1] Сервис пересчёта диапазона длительности в `backend/app/services/duration_estimate.py` (раздел 2.1.2 архитектурного документа: нижняя/верхняя граница, не хранится полем)
- [ ] T025 [US1] `GET /api/v1/vacancies/{id}/duration-estimate` (включая `warning` при `max_sec` > ~2700)
- [ ] T026 [US1] `POST /api/v1/vacancies/{id}/publish` — перевод `draft → ready` с проверкой непустого валидного списка вопросов
- [ ] T027 [US1] Подключить `vacancies`-роутер в `backend/app/main.py`
- [ ] T028 [P] [US1] `frontend/app/vacancies/new/page.tsx` — форма вакансии (название, описание, грейд, навыки)
- [ ] T029 [US1] `frontend/app/vacancies/[id]/page.tsx` — редактируемый список вопросов (правка/удаление/добавление/порядок), живой пересчёт длительности с мягким предупреждением, кнопка «Сохранить» → `publish`

**Checkpoint**: US1 полностью функциональна и демонстрируема независимо от US2/US3

---

## Phase 4: User Story 2 — Создание интервью и ссылка (Priority: P1)

**Goal**: рекрутёр загружает резюме и получает персональную ссылку на интервью (`spec.md`, US2)

**Independent Test**: `quickstart.md`, раздел «US2» — создать интервью по опубликованной
вакансии, получить непредсказуемый токен

### Implementation for User Story 2

- [ ] T030 [P] [US2] Сервис загрузки резюме в MinIO (`boto3`, sync-клиент через `run_in_threadpool`) в `backend/app/services/resume_storage.py` (см. `research.md`)
- [ ] T031 [P] [US2] Извлечение текста резюме (`pypdf`/`python-docx` по расширению) в `backend/app/services/resume_text.py`
- [ ] T032 [US2] Генератор криптографически случайного `access_token` в `backend/app/services/interview_tokens.py`
- [ ] T033 [US2] `POST /api/v1/vacancies/{id}/interviews` в `backend/app/routers/interviews.py` — только для `Vacancy.status=ready` (422 иначе)
- [ ] T034 [US2] Подключить `interviews`-роутер в `backend/app/main.py`
- [ ] T035 [US2] Блок «Создать интервью» на `frontend/app/vacancies/[id]/page.tsx` — загрузка резюме, опциональное имя, отображение готовой ссылки для копирования

**Checkpoint**: US1 + US2 работают вместе — рекрутёр проходит путь до готовой ссылки

---

## Phase 5: User Story 3 — Таблица кандидатов и отчёт (Priority: P1)

**Goal**: рекрутёр видит сравнительную таблицу и открывает полный отчёт с вердиктом (`spec.md`, US3)

**Independent Test**: `quickstart.md`, раздел «US3» — на засеянных данных (пока
[[005-batch-evaluation-contour]] не пишет `Evaluation` сам) убедиться, что таблица не
падает на записях без оценки и отчёт показывает все требуемые поля

### Implementation for User Story 3

- [ ] T036 [US3] `GET /api/v1/vacancies/{id}/interviews` — таблица со статусом и (если есть) `overall_score`/`verdict`
- [ ] T037 [US3] `GET /api/v1/interviews/{id}/report` — полный отчёт (`interview`, `evaluation`, `recruiter_decision`, warmup/closing транскрипты)
- [ ] T038 [US3] `PUT /api/v1/interviews/{id}/decision` — запись `RecruiterDecision`, независимая от `Evaluation.verdict` (раздел 6 — юридическое требование)
- [ ] T039 [P] [US3] `frontend/app/vacancies/[id]/candidates/page.tsx` — сравнительная таблица, клик по строке ведёт в отчёт
- [ ] T040 [US3] `frontend/app/interviews/[id]/report/page.tsx` — карточка отчёта (вступление/навыки/общий балл/вердикт+цитаты/заключение/warmup/closing) + элемент управления решением рекрутёра

**Checkpoint**: все три user story работают независимо; связка US1→US2→US3 демонстрируема целиком

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T041 Прогнать `quickstart.md` end-to-end вручную (API-часть + frontend-часть), зафиксировать результат в PR/README
- [ ] T042 [P] Обновить `backend/README.md` — команды миграций, новые эндпоинты, переменные `.env`
- [ ] T043 [P] Обновить `frontend/README.md` — список реализованных экранов рекрутёра (раздел «Статус»)
- [ ] T044 Обновить `specs/003-recruiter-vacancy-management/spec.md`, раздел «Синхронизация с кодом» — статус меняется с Not started на Implemented/Partial по факту

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей
- **Foundational (Phase 2)**: зависит от Setup — блокирует все user stories
- **User Stories (Phase 3–5)**: все зависят только от Foundational; между собой формально
  независимы, но естественный порядок демонстрации — US1 → US2 → US3 (нужна вакансия для
  интервью, нужно интервью для отчёта)
- **Polish (Phase 6)**: после выбранного набора user stories

### Within Each User Story

- Модели (Phase 2) → сервисы → эндпоинты → frontend-экран, в этом порядке внутри каждой фазы
- US2 использует `Vacancy` из US1 (только для проверки `status=ready`) — реализуем после US1, но код независим и не блокирует переиспользование
- US3 читает `Evaluation`/`RecruiterDecision`, которые эта фича только объявляет как схему (T010, T011) — реальные значения пишет [[005-batch-evaluation-contour]]; до его готовности US3 демонстрируется на данных, засеянных вручную (`quickstart.md`)

### Parallel Opportunities

- T001, T003, T004 — параллельно (разные файлы)
- T006–T011 (все ORM-модели) — параллельно
- T028 (frontend-форма вакансии) — параллельно с backend-тасками US1, если контракт (`contracts/api.md`) уже зафиксирован
- T030, T031 (US2 сервисы) — параллельно
- T039 (frontend-таблица) — параллельно с T036–T038, если контракт зафиксирован
- T042, T043 — параллельно

---

## Parallel Example: User Story 1

```bash
# Модели уже готовы из Phase 2 (T006-T011) — здесь параллелятся независимые куски US1:
Task: "Pydantic-схемы в backend/app/schemas/vacancy.py"
Task: "frontend/app/vacancies/new/page.tsx — форма вакансии"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **STOP and VALIDATE**: `quickstart.md`, раздел «US1» — вакансия создаётся, вопросы
   генерируются и редактируются, публикуется
3. Демонстрируемо уже здесь: LLM-генерация вопросов — самая рискованная с точки зрения
   качества часть US1, стоит проверить как можно раньше

### Incremental Delivery

1. Setup + Foundational → фундамент готов
2. US1 → демо «вакансия с вопросами» (уже ценно само по себе для показа LLM-качества)
3. US2 → демо «получил ссылку на интервью»
4. US3 → демо «таблица + отчёт» (на засеянных данных до готовности [[005-batch-evaluation-contour]])
5. Каждая story добавляет ценность, не ломая предыдущие

---

## Notes

- Все user story этой фичи — Priority P1 в `spec.md` (нет P2/P3) — естественный порядок
  US1→US2→US3 определяется зависимостью данных (вакансия → интервью → отчёт), не
  приоритетом важности.
- US3 сознательно не блокируется на [[005-batch-evaluation-contour]] — это отдельная
  спека со своим прогрессом; данные для демонстрации US3 засеиваются вручную, пока воркер
  не готов (см. `quickstart.md`).
- Каждый backend-таск, добавляющий эндпоинт, должен сверяться с `contracts/api.md` — не
  вводить незадокументированные поля запроса/ответа (Constitution, Principle IV).
