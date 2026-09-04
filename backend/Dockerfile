FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /uvx /bin/
COPY pyproject.toml uv.lock alembic.ini ./

FROM base AS dev
RUN uv sync --locked --extra dev
COPY app ./app
COPY tests ./tests
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS runner
RUN uv sync --locked --no-dev
COPY app ./app
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
