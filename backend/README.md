# Backend API

Новый минимальный backend на `FastAPI`, зависимости и запуск через `uv`.

## Статус

- Реализован только `GET /health`.
- БД, ORM, миграции и доменные роутеры пока отсутствуют.

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

## Дальше

- Вернуть конфиг приложения и доменные роутеры.
- Добавить БД и миграции.
- Подготовить API для нового frontend.
