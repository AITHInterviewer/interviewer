# Implementation Plan: Рекрутёр — вакансии, интервью, отчёты

**Branch**: `003-recruiter-vacancy-management` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-recruiter-vacancy-management/spec.md`

## Summary

Рекрутёр создаёт вакансию → получает LLM-сгенерированные вопросы с эталонами → создаёт
интервью по ссылке для кандидата → видит таблицу кандидатов по вакансии → открывает полный
отчёт с вердиктом. Технический подход: расширить пустой `backend/` (сейчас только
`GET /health`) доменной моделью на PostgreSQL (SQLAlchemy 2.0 async + Alembic), файловым
хранилищем резюме через MinIO (S3-совместимое, уже поднято в `infra/`), одним прямым
вызовом Anthropic Messages API для генерации вопросов вакансии; расширить пустой
`frontend/` четырьмя экранами поверх уже существующего `Next.js`/`shadcn/ui` каркаса.
`Evaluation`/`RecruiterDecision` — реальная схема данных, но реальные значения в неё пишет
[[005-batch-evaluation-contour]] (сейчас нет) — до его готовности отчёт демонстрируется на
данных, засеянных напрямую в БД (см. quickstart.md).

## Technical Context

**Language/Version**: Python 3.12 (backend, уже зафиксировано в `backend/pyproject.toml`); TypeScript / Node 22 (frontend, уже зафиксировано в `frontend/package.json`)

**Primary Dependencies**:
- Backend (новые, добавляются к существующим `fastapi`, `pydantic-settings`, `uvicorn`): `sqlalchemy[asyncio]>=2.0`, `asyncpg`, `alembic`, `boto3` (клиент MinIO/S3, синхронный — см. Complexity Tracking), `anthropic` (прямой вызов Messages API для генерации вопросов), `pypdf`/`python-docx` (извлечение текста резюме, без структурного парсинга — раздел 8 архитектурного документа)
- Frontend (новые, добавляются к существующим `next`, `react`, shadcn-компонентам): нативный `fetch` к backend API — отдельный HTTP-клиент не нужен на этом масштабе

**Storage**: PostgreSQL (уже поднят в `infra/docker-compose.yml`, порт 5432) для `Vacancy`/`Question`/`Interview`/`Evaluation`/`RecruiterDecision`; MinIO (S3-совместимое, порт 9000) для `resume_file_url` — отдельный префикс/бакет от видео/аудио (те принадлежат [[001-live-interview-contour]]/[[005-batch-evaluation-contour]], не этой фиче)

**Testing**: `pytest` + `httpx.AsyncClient` (уже используется в `backend/tests/test_health.py`, паттерн сохраняется); `pytest-asyncio`/`anyio` для БД-фикстур с тестовой транзакцией/схемой

**Target Platform**: Linux-контейнеры (Docker, см. `backend/Dockerfile`, `frontend/Dockerfile`) + браузер (recruiter — desktop-first, не мобильный сценарий)

**Project Type**: web application (`backend/` + `frontend/`, Option 2 ниже)

**Performance Goals**: не в критическом пути live-контура — не сформулировано в архитектурном документе численно; рабочее предположение: экраны рекрутёра отвечают <1s на типичных объёмах (одна вакансия — десятки вопросов, десятки интервью), без отдельной нагрузочной цели на MVP

**Constraints**: генерация вопросов — синхронный LLM-вызов в рамках HTTP-запроса рекрутёра (раздел 2.1 не описывает async-генерацию с поллингом) — редактор вопросов должен переносить типичную латентность LLM без выделенного прогресс-бара, кроме стандартного состояния загрузки формы

**Scale/Scope**: хакатон-MVP — один рекрутёр видит вакансии без multi-tenant изоляции (см. [[constitution]], Technology Constraints); 4 экрана фронтенда, ~6 backend-эндпоинтов

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-First Delivery** — PASS. `spec.md` существует и предшествует этому плану; `tasks.md` будет сгенерирован `speckit-tasks` до начала реализации.
- **II. Single SDD Source Of Truth** — PASS. Работа привязана к `specs/003-recruiter-vacancy-management/`, единственному источнику для recruiter-facing `backend/`+`frontend/` по [[constitution]].
- **III. Vertical Slices Over Horizontal Layers** — PASS. `tasks.md` будет организован по User Story 1/2/3 из `spec.md` (вакансия+вопросы / создание интервью / таблица+отчёт), каждая демонстрируема независимо (US1 не требует наличия интервью; US3 демонстрируется на засеянных данных, не дожидаясь [[005-batch-evaluation-contour]]).
- **IV. Contract-First Frontend/Backend Boundaries** — PASS, с обязательством: `contracts/` (Phase 1) фиксирует все эндпоинты до того, как `frontend/` начнёт их вызывать; фронтенд-таски в `tasks.md` MUST ссылаться на конкретный контракт.
- **V. Minimalism And Verifiable Change** — PASS, с одним отклонением, обоснованным ниже (Complexity Tracking): синхронный `boto3` вместо async S3-клиента — меньше нового кода, не нарушает бюджет производительности этой фичи (не в live-пути).

Нарушений, требующих отдельного оправдания сверх Complexity Tracking, нет.

## Project Structure

### Documentation (this feature)

```text
specs/003-recruiter-vacancy-management/
├── plan.md              # этот файл
├── research.md          # Phase 0
├── data-model.md         # Phase 1
├── quickstart.md         # Phase 1
├── contracts/             # Phase 1 — OpenAPI-подобное описание эндпоинтов
└── tasks.md               # Phase 2 (speckit-tasks, отдельным шагом)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── config.py                # существует — расширяется DB_URL/S3-настройками
│   ├── main.py                  # существует — регистрирует новые роутеры
│   ├── db.py                    # новое: SQLAlchemy async engine/session
│   ├── models/                  # новое: ORM-модели (vacancy.py, question.py, interview.py, evaluation.py, recruiter.py)
│   ├── schemas/                 # новое: Pydantic-схемы запросов/ответов (по контрактам)
│   ├── routers/
│   │   ├── health.py            # существует
│   │   ├── vacancies.py         # новое — US1
│   │   ├── interviews.py        # новое — US2, US3
│   │   └── auth.py              # новое — логин/magic-link рекрутёра (раздел 1)
│   ├── services/
│   │   ├── question_generation.py  # новое — вызов Anthropic Messages API (US1)
│   │   ├── resume_storage.py       # новое — загрузка резюме в MinIO (US2)
│   │   └── duration_estimate.py    # новое — пересчёт диапазона длительности (раздел 2.1.2)
│   └── migrations/              # новое — Alembic
└── tests/
    ├── test_health.py           # существует
    ├── test_vacancies.py        # новое
    └── test_interviews.py       # новое

frontend/
├── app/
│   ├── page.tsx                          # существует — станет входом в recruiter-дашборд
│   ├── vacancies/
│   │   ├── new/page.tsx                  # новое — US1, форма вакансии
│   │   └── [id]/
│   │       ├── page.tsx                  # новое — US1, редактор вопросов + US2, создание интервью
│   │       └── candidates/page.tsx       # новое — US3, таблица кандидатов
│   ├── interviews/[id]/report/page.tsx   # новое — US3, карточка отчёта
│   └── interview/[token]/page.tsx        # существует, вне этой фичи — см. [[004-candidate-interview-flow]]
├── lib/
│   └── api.ts                            # новое — типизированный клиент к backend-контрактам
└── components/
    └── ui/                                # существует (shadcn) — переиспользуется, новые компоненты добавляются точечно
```

**Structure Decision**: Web application, Option 2 (`backend/` + `frontend/`, оба уже существуют
как отдельные Next.js/FastAPI проекты в корне репозитория — новых top-level директорий эта
фича не добавляет). Роут кандидата (`/interview/[token]`) физически лежит в том же
`frontend/`, но принадлежит [[004-candidate-interview-flow]] — эта фича его не трогает.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Синхронный `boto3` вместо async S3-клиента (`aioboto3`) в async FastAPI-приложении | Загрузка резюме — низкочастотная операция (раз на интервью), не в бюджете латентности live-контура; `boto3` — стабильнее и лучше документирован, синхронный вызов оборачивается `run_in_threadpool` | `aioboto3` добавляет асинхронную обёртку и отдельный набор edge-кейсов (пул соединений, таймауты) ради операции, которая не создаёт нагрузку — противоречит Principle V (новая абстракция без демонстрированной необходимости) |
