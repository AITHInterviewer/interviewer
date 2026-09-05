FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# app/services/vacancy_llm_service.py — Claude Agent SDK на деле запускает `claude` CLI
# отдельным подпроцессом (SubprocessCLITransport), не только Python-пакет. CLI — Node-
# приложение (@anthropic-ai/claude-code), поэтому нужен Node.js в образе. Авторизация
# (`claude login`, подписка, не API-ключ) сюда не входит: контейнер читает существующие
# креды хоста через volume-mount на `~/.claude` (см. docker-compose.dev.yml), сам
# `claude login` в образе не делается — тот же паттерн, что `live-agent/Dockerfile`.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /uvx /bin/
COPY pyproject.toml uv.lock alembic.ini ./

FROM base AS dev
RUN uv sync --locked --extra dev
COPY app ./app
COPY tests ./tests
COPY scripts ./scripts
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS runner
RUN uv sync --locked --no-dev
COPY app ./app
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
