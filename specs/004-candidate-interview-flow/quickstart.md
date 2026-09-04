# Phase 1 Quickstart: Кандидат — прохождение видеоинтервью

Сквозная проверка без реального голосового стека (STT/TTS/LiveKit egress не нужны для
этого сценария) — проверяет именно то, что закрывает этот план: control-канал,
разделение ответственности backend/live-agent, реактивные переходы на фронте.

## Предпосылки

- `docker compose -f docker-compose.dev.yml up --build` — `frontend` (`:3000`) + `backend`
  (`:8000`), см. `README.md`.
- `infra/` поднят отдельно (`redis:3902`, `livekit-server:3907`) — нужен для
  control-канала и device-check/LiveKit-подключения; не нужен для этого quickstart, если
  тестируется только текстовая часть протокола (см. «Без LiveKit» ниже).
- Валидный `Interview.access_token` — создать через [[003-recruiter-vacancy-management]]
  API (или засеять напрямую в Postgres на этой стадии, пока API рекрутёра не готов).

## Сценарий A — без LiveKit/live-agent (фейковый control-канал)

Проверяет FE-часть (welcome/device-check/interview-room state machine) и WS-контракт
backend изолированно от голосового стека.

1. Запустить `redis` (`infra/docker-compose.yml`, только `redis`-сервис).
2. `python live-agent/scripts/simulate.py --publish-redis --interview-id <id>` (НОВЫЙ
   флаг — публикует те же события, что и `scripts/simulate.py` без него, но в Redis-канал
   `live-agent:events:<id>` вместо/вместе с файловым `EventLog`, см. `research.md` п.2 —
   задача на добавление флага в `tasks.md`).
3. Открыть `http://localhost:3000/interview/<access_token>`.
4. **Ожидаемо**: экран согласия → нажатие «Начать» → live-превью камеры/микрофона
   (реальные, браузерные) → после разрешения кандидат автоматически переходит в
   interview-room, как только WS-хендшейк подтверждён (LiveKit-часть в этом сценарии не
   обязательна для перехода — см. `tasks.md` за точным условием готовности).
5. По мере того как `simulate.py --publish-redis` шлёт события — экран интервью должен
   реактивно менять вопрос/чек-ин/адаптивный вопрос **без единого клика кандидата**
   (проверяет FR-008/FR-011/User Story 3).
6. Отключить микрофон в браузере на середине сценария → интервью не должно продолжаться
   без него (проверяет FR-013/User Story 1, Acceptance Scenario 3, если это уже дошло до
   `tasks.md` — иначе фиксируется как известный gap).

## Сценарий B — полный стек (ручная проверка, не CI)

1. `docker compose up` (корневой, полный) — поднимает `live-agent`, `infra`, `backend`,
   `frontend`.
2. `python -m ainterviewer.agent console` для локального голосового прогона ИЛИ
   реальный браузерный клиент кандидата, подключающийся к LiveKit room — сверить с
   `live-agent/README.md`, «Запуск», раздел 2.
3. Пройти интервью целиком голосом; проверить:
   - `out/<interview_id>.jsonl` не пуст и не изменился по формату (regression на
     `live-agent/CLAUDE.md` правило 5).
   - Redis-канал получил те же события (например, `redis-cli SUBSCRIBE
     live-agent:events:<id>` параллельно с прогоном).
   - В MinIO появились per-question `Answer`-файлы (`answer-upload.md`) и (если
     `livekit-egress` включён) один файл — полная запись звонка.

## Что проверяет каждый User Story из spec.md

| User Story | Как проверяется здесь |
|---|---|
| US1 (consent + device-check) | Сценарий A, шаги 3-4, 6 |
| US2 (video-call-подобный UI) | Сценарий B, визуально + `Answer`-файлы в MinIO |
| US3 (agent-driven transitions) | Сценарий A, шаг 5 |
| US4 (live_coding редактор) | Сценарий B с вопросом `format=live_coding` в моке вакансии (`live-agent/mock_data/interview_example.json`) |

## Известные ограничения на момент написания

- `simulate.py --publish-redis` — не реализован, это задача `tasks.md`, не факт из кода.
- LiveKit egress (полная запись звонка) ни разу не проверялся вживую даже до этого плана
  (см. `infra/docker-compose.yml`, комментарий) — Сценарий B, шаг 3 может потребовать
  дополнительной отладки конфига `livekit-egress-config.yaml`.
