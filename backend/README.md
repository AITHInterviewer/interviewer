# Backend API

Новый минимальный backend на `FastAPI`, зависимости и запуск через `uv`.

## Статус

- Реализованы `GET /health` и auth-контур для внутренних пользователей.
- Есть ORM-модель `InternalUser`, async DB layer, репозиторий, сервисы, DI-зависимости и первая Alembic-миграция.
- Реализованы эндпоинты `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/internal-users`, `GET /api/v1/internal-users/me/landing`.

## Стек

- **FastAPI**
- **uv** для управления окружением и зависимостями
- **pytest**
- **ruff**

## Установка и запуск

```bash
docker compose -f ../infra/docker-compose.yml up -d postgres
cd backend
uv sync --extra dev
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API будет доступен на `http://localhost:8000/health`.

Для хостового запуска `backend/.env` должен указывать на `localhost:5432`.
Для `backend/docker-compose.yml` Postgres хост переопределяется на контейнерный `postgres`.

После запуска также доступны auth-роуты под `/api/v1`.

## Команды

```bash
uv run alembic upgrade head
uv run ruff check app/ tests/
uv run pytest -q
```

## Docker

```bash
docker compose -f ../docker-compose.dev.yml up --build
```

Для сервис-локального запуска остаётся `backend/docker-compose.yml`, но canonical happy path для локальной FE/BE разработки находится в корне репозитория.

## Конфигурация

- `backend/.env` управляет mutable runtime-настройками
- `CORS_ORIGINS` должен включать локальный frontend URL baseline
- `DATABASE_URL` задаёт основной async database connection string
- `JWT_SECRET` и `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` управляют подписью и временем жизни access token

## Зависимости и образ

- зависимости управляются через `pyproject.toml` и `uv.lock`
- Docker-образ использует `uv` внутри контейнера и не требует внешнего Python setup для сборки
- тот же Dockerfile используется для локального baseline и CI-сборки

## Дальше

- Добавить persisted revocation/rotation стратегию, если auth-модель выйдет за рамки MVP bearer session.
- Расширить role-specific workflows для `hiring_manager` и `expert` поверх уже готовой auth-модели.
