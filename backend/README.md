# Backend API

Новый минимальный backend на `FastAPI`, зависимости и запуск через `uv`.

## Статус

- `GET /health`.
- Кандидатский флоу (specs/004-candidate-interview-flow): `GET /interview/{access_token}`
  (consent-info), `POST /interview/{access_token}/livekit-token`, WS control-канал
  `GET /ws/interview/{access_token}`.
- Минимальный DB-слой (Postgres, SQLAlchemy async + Alembic): `Recruiter`/`Vacancy`/
  `Question`/`Interview` (schema-only срез specs/003-recruiter-vacancy-management, без
  CRUD рекрутёра) + `Answer` (specs/004). Не прогонялось на реальном Postgres — см.
  `specs/004-candidate-interview-flow/tasks.md`, «Known Gaps».
- `app/routers/mock_interview.py` — временный контур ручной проверки STT/TTS, не часть
  боевой архитектуры (см. его docstring).

## Стек

- **FastAPI**
- **uv** для управления окружением и зависимостями
- **pytest**
- **ruff**

## Установка и запуск

```bash
cd backend
uv sync --extra dev
cp .env.example .env
uv run uvicorn app.main:app --reload
```

API будет доступен на `http://localhost:8000/health`.

## Команды

```bash
uv run ruff check app/ tests/
uv run pytest -q
```

## Миграции

```bash
uv run alembic upgrade head
```

Требует `infra/docker-compose.yml` (сервис `postgres`) поднятым отдельно — `docker-compose.dev.yml`
в корне репозитория Postgres не поднимает. `app/migrations/versions/0001_initial.py`
написана вручную (не `alembic revision --autogenerate`) — на первом реальном Postgres
сверить `alembic check` на пусто, прежде чем полагаться на неё дальше.

## Docker

```bash
docker compose -f ../docker-compose.dev.yml up --build
```

Для сервис-локального запуска остаётся `backend/docker-compose.yml`, но canonical happy path для локальной FE/BE разработки находится в корне репозитория.

## Конфигурация

- `backend/.env` управляет mutable runtime-настройками
- `CORS_ORIGINS` должен включать локальный frontend URL baseline

## Зависимости и образ

- зависимости управляются через `pyproject.toml` и `uv.lock`
- Docker-образ использует `uv` внутри контейнера и не требует внешнего Python setup для сборки
- тот же Dockerfile используется для локального baseline и CI-сборки

## Dev-данные

Нет CRUD рекрутёра — единственный способ получить реальный `access_token` для ручной
проверки:

```bash
uv run python scripts/seed_demo_interview.py
```

Печатает `access_token` и готовую ссылку `http://localhost:3000/interview/<token>`.
Вакансия/вопросы захардкожены, текст вопросов совпадает с
`live-agent/mock_data/interview_example.json` (осознанное упрощение, не настоящий CRUD).

## Дальше

- Прогнать миграцию (`alembic upgrade head`) и `alembic check` на реальном Postgres —
  писалась вручную без доступа к живой БД.
- Answer-upload (`POST /interview/{access_token}/answers/{question_id}/chunks`+`finalize`,
  specs/004-candidate-interview-flow, tasks.md T020/T021).
- Пересылка `candidate_input` из WS в `live-agent` (T028).
- CRUD рекрутёра / вакансий (остальной скоуп specs/003-recruiter-vacancy-management —
  сейчас поднята только схема таблиц, без эндпоинтов).
