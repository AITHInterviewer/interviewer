# evaluation-agent (batch-контур)

Второй контур системы — асинхронная точная оценка кандидата после интервью (раздел 3
[docs/Архитектура и дизайн MVP.md](../docs/Архитектура%20и%20дизайн%20MVP.md)). Не REST
API — очередь-консьюмер (см. корневой [README.md](../README.md), таблица сервисов),
реагирует на `interview_completed` от `live-agent/`, не отвечает на HTTP-запросы.

Названа не «batch-agent», а по тому, ЧТО делает (оценка по рубрике), а не КАК (батчами)
— решение из истории чата.

## Статус

`worker.py` обрабатывает durable outbox-задачи: забирает job из backend, получает входные
данные интервью, оценивает ответы, сохраняет результат и отмечает job complete/failed.

## Стек

- **Pydantic** — типы (`schema.py`), общие по смыслу с `Evaluation`/`Question` в
  `backend/app/models.py`, но независимая копия — сервисы разделены, не шарят ORM.
- **Redis** — очередь задач (в зависимостях, использование — TODO).
- **httpx** — вызовы backend API (TODO).
- **large-v3-turbo** (`deepdml/faster-whisper-large-v3-turbo-ct2`, через `stt-accurate` в
  `docker-compose.yml`) — та же модель, что оказалась слишком медленной для `live-agent`
  (20–30 сек/реплику на CPU без GPU, история чата), но здесь — её законное место: точность
  важнее латентности, real-time бюджета в единицы секунд тут нет.

## Установка и запуск

```bash
cd evaluation-agent
python -m venv .venv && .venv/Scripts/activate   # или source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

pytest                    # 11/11 зелёных — только verdict.py
ruff check src/ tests/
```

Запустите `python -m evaluation_agent.worker`, чтобы начать polling backend.

## Провайдер оценки

`EVALUATION_LLM_PROVIDER` выбирает судью без изменения кода:

- `claude` — значение по умолчанию; использует Claude Agent SDK и `LLM_MODEL`.
- `kimi` — использует Moonshot API с `MOONSHOT_API_KEY` и `KIMI_MODEL` (по умолчанию `kimi-k2.6`).
  Ключи официальных платформ .ai/.cn между собой НЕ взаимозаменяемы, а ключи Kimi for Coding
  (консоль kimi.ai/code) вообще не принимает официальный api.moonshot.ai — им нужен
  `KIMI_BASE_URL=https://api.kimi.com/coding/v1/chat/completions` и `KIMI_MODEL=kimi-for-coding`
  (проверено 2026-09-06; доступные модели на KFC: `kimi-for-coding`, `kimi-for-coding-highspeed`, `k3`).
- `dummygpt` — всегда создаёт детерминированный mock review по эталону и транскрипту; API-ключ не нужен.

Для Docker Compose используйте `BACKEND_URL=http://backend:8000`; при локальном запуске
evaluation-agent вне Docker используйте `http://localhost:8000`. `BACKEND_SERVICE_TOKEN`
должен совпадать с backend `EVALUATION_SERVICE_TOKEN`.

## Через Docker Compose

```bash
docker compose -f ../infra/docker-compose.yml -f docker-compose.yml up --build
```

Контейнер ожидает доступность backend и повторяет claim-запросы, пока нет pending-задач.

## Куда смотреть за подробностями

- Правило вердикта — `src/evaluation_agent/verdict.py`, раздел 5.1 архитектурного документа.
- План реализации воркера — докстринг `run_worker()` в `src/evaluation_agent/worker.py`.
- Формат протокола событий, который worker будет читать (после переключения с файлов на
  очередь) — `live-agent/README.md`, раздел «Протокол событий».
