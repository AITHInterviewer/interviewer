# Live-контур как контейнер — для деплоя как LiveKit-воркера (не console-режим,
# который нужен только для локальной ручной проверки с реальным микрофоном).
FROM python:3.11-slim

WORKDIR /app

# claude_agent_sdk (llm_client.py) на деле запускает `claude` CLI отдельным подпроцессом
# (SubprocessCLITransport) — не только Python-пакет. CLI — Node-приложение
# (@anthropic-ai/claude-code), поэтому нужен Node.js в образе. Сама авторизация (claude
# login, подписка, не API-ключ — CLAUDE.md правило 8) сюда не входит: контейнер читает
# существующие креды хоста через volume-mount на `~/.claude` (см. docker-compose.yml),
# сам `claude login` в образе не делается — это на хосте, разово, интерактивно.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src ./src
COPY mock_data ./mock_data

RUN pip install --no-cache-dir -e .

# Предзагрузка файлов плагинов (Silero VAD и т.п.) в образ — иначе первый запуск
# воркера в проде тянет их из сети при первом job'е.
RUN python -m ainterviewer.agent download-files

# console-режим внутри контейнера не имеет смысла (нет аудио-устройств) — в проде
# entrypoint — `dev`/`start` (штатные режимы LiveKit Agents, слушают комнату по сети),
# не проверено вживую (нужен реальный livekit-server, см. ../infra).
CMD ["python", "-m", "ainterviewer.agent", "start"]
