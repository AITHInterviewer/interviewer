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
docker compose -f docker-compose.yml up --build
```

## Дальше

- Вернуть конфиг приложения и доменные роутеры.
- Добавить БД и миграции.
- Подготовить API для нового frontend.
