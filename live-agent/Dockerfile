# Live-контур как контейнер — для деплоя как LiveKit-воркера (не console-режим,
# который нужен только для локальной ручной проверки с реальным микрофоном).
FROM python:3.11-slim

WORKDIR /app

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
