# evaluation-agent (batch-контур)

Второй контур системы — асинхронная точная оценка кандидата после интервью (раздел 3
[docs/Архитектура и дизайн MVP.md](../docs/Архитектура%20и%20дизайн%20MVP.md)). Не REST
API — очередь-консьюмер (см. корневой [README.md](../README.md), таблица сервисов),
реагирует на `interview_completed` от `live-agent/`, не отвечает на HTTP-запросы.

Названа не «batch-agent», а по тому, ЧТО делает (оценка по рубрике), а не КАК (батчами)
— решение из истории чата.

## Статус — честно

- ✅ **`verdict.py` — правило вынесения вердикта (раздел 5.1) реализовано полностью и
  протестировано** (`pytest`, 11 тестов — каждый называет конкретный пункт правила: минимум
  по обязательным навыкам, среднее по доп. навыкам, штраф за подсказку, stretch-бонус не
  топит навык, противоречие блокирует «подходит» и т.д.). Единственная часть сервиса, не
  зависящая от внешней инфраструктуры — поэтому единственная, что реально готова.
- ❌ **`worker.py` — каркас, `NotImplementedError`.** Точный ASR, нарезка записи по
  таймстампам, LLM-оценка по вопросам, запись в backend — не реализовано. Подробный план
  по шагам — докстринг `run_worker()` в самом файле, не дублирую здесь.

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

`python -m evaluation_agent.worker` упадёт с `NotImplementedError` — ожидаемо, см. «Статус».

## Через Docker Compose

```bash
docker compose -f ../infra/docker-compose.yml -f docker-compose.yml up --build
```

Контейнер `evaluation-agent` завершится с ошибкой сразу после старта (воркер не
реализован) — это не баг сборки, я об этом прямо предупреждаю в `docker-compose.yml`.

## Куда смотреть за подробностями

- Правило вердикта — `src/evaluation_agent/verdict.py`, раздел 5.1 архитектурного документа.
- План реализации воркера — докстринг `run_worker()` в `src/evaluation_agent/worker.py`.
- Формат протокола событий, который worker будет читать (после переключения с файлов на
  очередь) — `live-agent/README.md`, раздел «Протокол событий».
