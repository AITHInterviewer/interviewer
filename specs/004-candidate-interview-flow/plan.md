# Implementation Plan: Кандидат — прохождение видеоинтервью

**Branch**: `004-candidate-interview-flow` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-candidate-interview-flow/spec.md`

## Summary

Кандидат проходит интервью в браузере как видеозвонок: welcome-экран (согласие + live
device-check) → interview-room (вопрос по центру, тайлы кандидата/агента, запись,
реактивные переходы). Технический подход: **frontend говорит только с backend** по
одному WebSocket control-каналу (`/ws/interview/{access_token}`, тот же процесс, что и
REST API — новый порт не нужен); **backend не принимает решений** — он подписан на Redis
pub/sub канал, в который `live-agent` дополнительно (не вместо файлового `EventLog`)
публикует те же события, что уже пишет в `out/<id>.jsonl`, и транслирует их
кандидату как `ControlEvent`. Медиапоток к `live-agent` идёт через LiveKit room
(инфраструктура уже поднята в `infra/`); ответы на конкретные вопросы (для
batch-контура) кандидат пишет отдельно через `MediaRecorder` + чанк-аплоад по HTTP —
не через WS и не через LiveKit egress. Целиком звонок дополнительно пишется через
LiveKit room composite egress (тоже уже сконфигурирован, не проверен вживую).

## Technical Context

**Language/Version**: Python 3.12 (`backend/`, `live-agent/`), TypeScript 5.9 / Node (`frontend/`, Next.js 16, React 19)

**Primary Dependencies**:
- `backend/`: FastAPI (WebSocket-эндпоинт на том же ASGI-приложении, что и REST), `redis` (async client, pub/sub consumer), `livekit-api` (Python SDK — выпуск access token для LiveKit room)
- `live-agent/`: `redis` (async client, publisher — новый sink рядом с существующим `EventLog`), без изменений в `livekit-agents`/STT/TTS-стеке
- `frontend/`: нативный `WebSocket` API (без доп. библиотеки — протокол простой JSON), `livekit-client` (JS SDK для подключения браузера кандидата к LiveKit room), нативный `MediaRecorder` (уже в FR-003 спека)

**Storage**: Postgres (владеет `specs/003-recruiter-vacancy-management/` — `Interview`/`Question`; эта фича добавляет `Answer`), Redis (control-канал event bus между `live-agent` и `backend`, эфемерно — не персистентное хранилище), MinIO/S3 (сырые файлы ответов из `MediaRecorder` + LiveKit egress-запись звонка)

**Testing**: `pytest` (backend WS-эндпоинт и Redis-consumer, live-agent Redis-sink), `vitest` + `@testing-library/react` (frontend welcome/device-check/interview-room), fake-канал сценарии без реального LiveKit/Redis для CI (см. `quickstart.md`)

**Target Platform**: браузер кандидата (desktop, getUserMedia/MediaRecorder/WebSocket/WebRTC), сервисы — Docker Compose (`backend`, `live-agent`, `infra` — redis/livekit уже подняты)

**Project Type**: web-service, три взаимодействующих сервиса (`frontend`, `backend`, `live-agent`) — Option 2 (Web application) из шаблона, расширенная третьим сервисом для медиа/диалоговой логики

**Performance Goals**: `ControlEvent` доходит до кандидата не позже, чем через ~1с после того, как `live-agent` принял решение (согласовано с собственным бюджетом задержки live-контура, [[001-live-interview-contour]], SC — единицы секунд на LLM-решение) — control-канал не должен добавлять к этому заметную задержку сверху

**Constraints**: control-канал НЕ переносит медиапоток (FR-012); backend НЕ дублирует и не переопределяет решения `LiveContourEngine` (FR-011); `live-agent`-файловый `EventLog` (`out/*.jsonl`) остаётся источником истины для batch-контура и не меняет формат — Redis-публикация строго аддитивна (см. `research.md`, п.2, и `live-agent/CLAUDE.md` правило 5)

**Scale/Scope**: один кандидат на интервью-сессию (1:1 WS-соединение, 1:1 LiveKit room на interview_id) — многопользовательский масштаб вне скоупа MVP

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-First Delivery** — PASS. `spec.md` обновлён и одобрен перед этим планом; `plan.md` → `tasks.md` (следующий шаг) — реализация не начинается раньше.
- **II. Single SDD Source Of Truth** — PASS. Работа целиком в `specs/004-candidate-interview-flow/`, ссылается на [[001-live-interview-contour]] и [[003-recruiter-vacancy-management]] через `[[...]]`, не создаёт параллельный процесс.
- **III. Vertical Slices Over Horizontal Layers** — PASS (переносится в `tasks.md`, следующая фаза): User Story 1 (consent+device-check), User Story 2 (video-call-подобный интерфейс), User Story 3 (agent-driven transitions/control-канал), User Story 4 (live_coding) — каждая независимо тестируема и демонстрируема, план ниже группирует задачи так, чтобы это сохранилось.
- **IV. Contract-First Frontend/Backend Boundaries** — PASS, закрывается этим планом: `contracts/control-channel.md`, `contracts/livekit-token.md`, `contracts/answer-upload.md` описаны до реализации; ничего из FE не должно полагаться на недокументированный формат.
- **V. Minimalism And Verifiable Change** — PASS. WS-эндпоинт вешается на существующий `backend`-процесс (не новый сервис/порт); Redis и LiveKit уже подняты в `infra/` — переиспользуются, не дублируются; `live-agent`-файловый протокол не переписывается, только дополняется одним sink.

Нет нарушений, требующих `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/004-candidate-interview-flow/
├── plan.md              # этот файл
├── research.md           # Phase 0 — открытые технические решения, закрытые здесь
├── data-model.md          # Phase 1 — Answer, ControlEvent и связанные схемы
├── contracts/              # Phase 1 — WS-протокол, REST-контракты
│   ├── control-channel.md
│   ├── livekit-token.md
│   └── answer-upload.md
├── quickstart.md            # Phase 1 — сценарий сквозной проверки без реального голосового стека
└── tasks.md                  # Phase 2 (/speckit-tasks, НЕ создаётся этим планом)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── routers/
│   │   ├── health.py                 # существует
│   │   └── interview_ws.py            # НОВОЕ: WS-эндпоинт /ws/interview/{access_token}
│   ├── services/
│   │   ├── control_channel.py         # НОВОЕ: Redis-subscriber → ControlEvent-маппинг, без бизнес-решений
│   │   ├── livekit_tokens.py           # НОВОЕ: выпуск LiveKit access token по access_token интервью
│   │   └── answer_storage.py            # НОВОЕ: приём чанков MediaRecorder → MinIO, создание Answer
│   └── models/
│       └── answer.py                     # НОВОЕ: см. data-model.md
└── tests/
    ├── test_interview_ws.py               # НОВОЕ
    └── test_control_channel.py             # НОВОЕ

live-agent/
├── src/ainterviewer/
│   ├── events.py                          # правки: НЕ меняет EventType/Event/EventLog — см. research.md п.2
│   └── control_bridge.py                   # НОВОЕ: RedisEventSink, публикует те же Event параллельно EventLog.emit()
└── tests/
    └── test_control_bridge.py               # НОВОЕ

frontend/
├── app/interview/[token]/
│   ├── page.tsx                              # правки: welcome/consent + device-check (US1)
│   ├── interview-room.tsx                     # НОВОЕ: video-call-подобный layout (US2/US3/US4)
│   └── page.test.tsx                          # правки
├── lib/
│   ├── control-channel.ts                      # НОВОЕ: WS-клиент + client-side state machine (ControlEvent → UI-состояние)
│   └── livekit-client.ts                        # НОВОЕ: подключение к LiveKit room
└── components/
    └── interview/                                # НОВОЕ: CandidateTile, AgentTile, QuestionPanel, AnswerInput, CodeEditorPanel
```

**Structure Decision**: Web-application из трёх существующих сервисов
(`frontend`/`backend`/`live-agent`), без новых сервисов и без нового порта — WS
подключается к уже занятому `backend:8000` (см. `research.md`, п.1); единственное новое
занятие инфраструктуры — Redis pub/sub канал (использует уже поднятый `redis:3902`, не
новый контейнер).

## Complexity Tracking

*Нет нарушений Constitution Check — раздел не заполняется.*
