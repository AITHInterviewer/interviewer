---

description: "Task list for feature implementation"
---

# Tasks: Кандидат — прохождение видеоинтервью

**Input**: Design documents from `/specs/004-candidate-interview-flow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (control-channel.md, livekit-token.md, answer-upload.md), quickstart.md

**Tests**: не запрошены явно в `spec.md` — отдельных test-first-задач нет для UI-тасков;
для протокольного ядра (control-канал, Redis-мост) тесты включены явно (T033, T034) —
это регрессия на инварианты FR-011/live-agent CLAUDE.md правило 5, которые нельзя
проверить визуально. Остальная проверка — `quickstart.md` (T039) плюс существующий
`pytest`/`vitest`-паттерн репозитория остаётся в силе для нового кода без отдельных
тасков здесь.

**Organization**: задачи сгруппированы по user story из `spec.md` — US1 (P1,
consent+device-check), US2 (P1, video-call-подобный интерфейс), US3 (P1, control-канал/
agent-driven transitions), US4 (P2, live_coding-редактор).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Добавить `redis` (async client) в зависимости `backend/pyproject.toml` и `livekit-api` (Python SDK для выпуска access token) — см. `plan.md`, Technical Context
- [X] T002 [P] Добавить `REDIS_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL` в `backend/app/config.py` и `backend/.env.example` (значения по умолчанию — dev-ключи `infra/docker-compose.yml`, `devkey`/`secret`)
- [X] T003 [P] Добавить `redis` (async client, publisher) в зависимости `live-agent/pyproject.toml`

**Checkpoint**: зависимости и конфиг на месте

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: US2/US3/US4 не могут быть продемонстрированы без этой фазы — control-канал
end-to-end (live-agent → Redis → backend → frontend) должен работать хотя бы на фейковых
событиях. US1 (см. Notes) от этой фазы не зависит и может вестись параллельно.

- [X] T004 ORM-модель `Answer` в `backend/app/models/answer.py` + Alembic-миграция в `backend/app/migrations/versions/` (см. `data-model.md`, раздел `Answer`) — попутно поднят весь минимальный DB-слой [[003-recruiter-vacancy-management]] (`Recruiter`/`Vacancy`/`Question`/`Interview`, только схема), которого не было в коде вообще; `interview_directory.py`-заглушка удалена, `candidate_interview.py` читает из Postgres. Миграция написана вручную (нет живого Postgres в песочнице, где писался код) — при первом запуске на реальном Postgres сверить `alembic check`/`--autogenerate` diff на пусто.
- [X] T005 [US-agnostic] Реализовать `RedisEventSink` в `live-agent/src/ainterviewer/control_bridge.py` — публикует тот же `Event` (`events.py`, БЕЗ изменения схемы) в канал `live-agent:events:{interview_id}` **параллельно** с `EventLog.emit()` (см. `research.md` п.2 — аддитивно, `live-agent/CLAUDE.md` правило 5 не нарушается)
- [X] T006 Подключить `RedisEventSink` рядом с `EventLog` в `live-agent/src/ainterviewer/agent.py` — каждый `emit()` идёт в оба sink. **Попутно найден и исправлен блокер** (обнаружен при подготовке к сквозному прогону, 2026-09-04): `entrypoint()` брал `interview_id` только из захардкоженного `mock_data/interview_example.json` ("demo-001"), игнорируя `ctx.job.room.name` — Redis-канал, в который публикует `live-agent`, никогда не совпадал бы с каналом, который слушает backend (`room_name` = реальный `Interview.id`, см. `contracts/livekit-token.md`), control-канал молча не получал бы ни одного события. Исправлено — `interview.interview_id` переопределяется на `ctx.job.room.name`, когда он есть; вопросы по-прежнему из мок-файла (хардкод вакансии — принятое упрощение).
- [X] T007 WS-эндпоинт `GET /ws/interview/{access_token}` (хендшейк/валидация токена, коды закрытия `4401`/`4409`) в `backend/app/routers/interview_ws.py` — см. `contracts/control-channel.md`. `candidate_input` от кандидата пока только логируется, не пересылается (см. T028).
- [X] T008 Сервис `backend/app/services/control_channel.py` — подписка на Redis-канал `live-agent:events:{interview_id}`, маппинг `EventType → ControlEvent` строго по таблице из `data-model.md` (без собственной логики решений — FR-011). `reconnect_status` (генерируется backend'ом локально) — не реализован, см. Known Gaps.
- [X] T009 Подключить `interview_ws`-роутер в `backend/app/main.py`
- [X] T010 [P] `frontend/lib/control-channel.ts` — WS-клиент + client-side state machine (состояния из `data-model.md`, раздел «Client-side interview state»), пока без UI-потребителей
- [X] T011 [P] Реализовать `livekit_tokens.py` в `backend/app/services/` + `POST /interview/{access_token}/livekit-token` в `backend/app/routers/candidate_interview.py` — см. `contracts/livekit-token.md`

**Checkpoint**: фейковый поток событий (`live-agent` → Redis → backend → frontend
state machine) проходит целиком — US2/US3/US4 могут строить UI поверх готового канала

**Known Gaps на момент этой реализации (не выдаём желаемое за проверенное, см.
`live-agent/CLAUDE.md`, правило 10, тот же принцип применяется здесь)**:
- Не прогнано end-to-end на реальных Postgres/Redis/LiveKit — в песочнице, где писался
  код, нет Docker/сети до этих сервисов. Backend-тесты (`pytest`, 14 шт.) проходят на
  SQLite-in-memory вместо Postgres (см. `tests/conftest.py`) и `fakeredis` вместо Redis
  (`tests/test_interview_ws.py`, T031 — покрывает хендшейк, коды закрытия 4401/4409,
  ПОЛНЫЙ relay-цикл Redis→ControlEvent→WS-сообщение и закрытие на `completed` реальной
  асинхронной оркестрацией, не моком) — это проверяет протокол и бизнес-логику, не саму
  связность с настоящим Postgres/asyncpg/Redis по сети. Миграция `0001_initial.py`
  написана вручную, не автосгенерирована — сверить `alembic check` на первом реальном
  Postgres. LiveKit (медиатранспорт) и STT/TTS вообще не задействованы ни в одном тесте —
  `livekit-api`/`livekit-client` (выпуск токена, `lib/livekit-client.ts`) проверены только
  тем, что компилируются и что `POST .../livekit-token` возвращает непустой JWT, не тем,
  что реальный LiveKit-сервер его принимает.
- `question_id`, который `live-agent` кладёт в `Event`, сейчас берётся из мок-вакансии
  (`mock_data/interview_example.json`, строки вида `q1`) — не совпадает с Postgres UUID
  `question.id`. `control_channel.py` на этот случай отдаёт консервативный
  `input_format=none` вместо падения, но реальный `input_format=code` для `live_coding`
  заработает только когда [[001-live-interview-contour]] будет читать вопросы из
  Postgres, а не из мок-файла — отдельная интеграционная работа, не предмет этой фичи.
- `candidate_input` от кандидата (T027/T028) принимается WS-эндпоинтом, но не
  пересылается дальше в `live-agent` и не сохраняется в `Answer.code_snapshots` — только
  логируется. Реализация T028 намеренно отделена, т.к. требует решить сам механизм связи
  backend→live-agent в обратную сторону (Redis pub/sub в другую сторону? прямой вызов?),
  чего не было в `research.md`.
- `reconnect_status` (`data-model.md` — единственный `ControlEvent.type`, не имеющий
  источника в `live-agent`) не генерируется backend'ом — WS просто закрывается на
  разрыве, frontend (`control-channel.ts`) сам детектит это по `onclose` и показывает
  `reconnecting`, но backend не шлёт явное подтверждение восстановления подписки.
- Reconnect намеренно не ограничен по частоте/количеству — обсуждалось с пользователем
  2026-09-04, решено не решать сейчас (не путать с прокторингом, который вне скоупа
  спеки другим пунктом).

---

## Phase 3: User Story 1 — Согласие и проверка камеры/микрофона (Priority: P1) 🎯 MVP

**Goal**: кандидат видит экран согласия, жмёт «Начать», разрешает камеру/микрофон,
видит live-превью; при отказе — блокирующий экран с повтором (`spec.md`, US1)

**Independent Test**: открыть `/interview/[token]` с валидным токеном — согласие
показывается первым, блокирует переход без подтверждения; отказ в доступе к устройствам
не пускает дальше (см. `spec.md`, US1, Acceptance Scenarios)

### Implementation for User Story 1

- [X] T012 [US1] Публичный `GET /interview/{access_token}` в `backend/app/routers/candidate_interview.py` — метаданные для экрана согласия (название вакансии, кол-во вопросов, диапазон длительности из [[003-recruiter-vacancy-management]], `Interview.status`)
- [X] T013 [P] [US1] Экран согласия с раздельными пунктами + кнопкой «Начать» — реализован в `frontend/components/interview/InterviewFlow.tsx` (клиентский компонент), `page.tsx` остаётся серверным и только резолвит `token`: `getUserMedia`/`useState` требуют `"use client"`, который нельзя поставить на страницу с `async params`
- [X] T014 [US1] Компонент `frontend/components/interview/DeviceCheck.tsx` — `getUserMedia`, live-превью `<video>` + индикатор уровня микрофона (Web Audio `AnalyserNode`)
- [X] T015 [US1] Блокирующий экран отказа в доступе + кнопка повторного запроса в `DeviceCheck.tsx` (FR-013, US1 Acceptance Scenario 3)
- [X] T016 [US1] `frontend/app/interview/[token]/page.test.tsx` — тест на гейтинг (нет перехода без согласия/устройств) и на состояние повтора после отказа

**Checkpoint**: US1 полностью функциональна и демонстрируема независимо — не требует
Phase 2 (control-канал не участвует в этом сценарии)

---

## Phase 4: User Story 2 — Видеозвонок-подобный интерфейс (Priority: P1)

**Goal**: тайлы кандидата/агента, вопросы по центру с TTS/субтитрами, ответ пишется
`MediaRecorder`-ом отдельным файлом на вопрос (`spec.md`, US2)

**Independent Test**: пройти интервью из 2–3 вопросов (на фейковом потоке `simulate.py`
из Phase 5/T032, либо на реальном `live-agent`), убедиться в отдельном `Answer` на
вопрос и что warmup/closing визуально не выделены (`spec.md`, US2)

### Implementation for User Story 2

- [X] T017 [US2] Layout интервью — реализован в уже существующем `frontend/components/interview/InterviewRoom.tsx` (не в новом `app/interview/[token]/interview-room.tsx`, чтобы не заводить второй компонент рядом с уже подключённым в `InterviewFlow.tsx`), подключён к `control-channel.ts` (T010)
- [X] T018 [P] [US2] `frontend/lib/livekit-client.ts` — подключение к LiveKit room через токен из T011, публикация треков из `DeviceCheck`-стрима
- [X] T019 [US2] Упрощение: тайлы кандидата/агента — инлайн-разметка в `InterviewRoom.tsx`, не отдельные `CandidateTile.tsx`/`AgentTile.tsx` компоненты (нечего переиспользовать за пределами этого экрана на этой итерации — вынести в отдельные файлы, когда появится второй потребитель)
- [ ] T020 [US2] Сервис `answer_storage.py` в `backend/app/services/` — приём чанков, склейка, запись `Answer` (T004) в MinIO — см. `contracts/answer-upload.md`. **Отложено осознанно** — цель ближайшей итерации (обсуждение с пользователем 2026-09-04, `/goal`) сужена до самого флоу разговора, вакансия/вопросы захардкожены; запись/сохранение ответов — следующий шаг.
- [ ] T021 [US2] `POST /interview/{access_token}/answers/{question_id}/chunks` и `/finalize` — отложено вместе с T020
- [ ] T022 [US2] Интеграция `MediaRecorder` — отложено вместе с T020/T021 (сейчас `InterviewRoom.tsx` публикует камеру/микрофон в LiveKit для реалтайм-обработки речи, но не пишет и не грузит их отдельно на backend)
- [X] T023 [US2] Рендер `ControlEvent.text` — `InterviewRoom.tsx` показывает текст вопроса как есть; warmup/closing не различаются визуально (нечего различать — рендерится одно и то же поле)
- [X] T024 [US2] Финальный экран по `ControlEvent.type=completed` — реализован (`StatusLine`, статус `completed`)

**Checkpoint**: US1 + US2 работают вместе — кандидат проходит путь от согласия до
финального экрана на фейковом или реальном потоке решений

---

## Phase 5: User Story 3 — Переход инициирует агент, не кандидат (Priority: P1)

**Goal**: все переходы (вопрос/чек-ин/адаптивный вопрос/поле ввода) строго по
`ControlEvent`, backend не переопределяет решения `live-agent` (`spec.md`, US3, FR-009..FR-012)

**Independent Test**: прогнать `scripts/simulate.py --publish-redis` (T032) с серией
решений и убедиться, что UI переключается только по приходу события — без клика/таймера
кандидата (`quickstart.md`, Сценарий A)

### Implementation for User Story 3

- [X] T025 [US3] Строго связать переходы `InterviewRoom.tsx` с `ControlEvent` — нет ни одного локального «next»-контрола, весь UI реактивен к `channelState`
- [ ] T026 [US3] `frontend/components/interview/AnswerInput.tsx` — условный рендер поля ввода по `ControlEvent.input_format` — отложено вместе с T020-T022 (хардкод-вопросы этой итерации все `format=voice` → `input_format=none`, нечего рендерить)
- [ ] T027 [US3] Отправка `candidate_input` по control-каналу для `input_format != none` — метод `sendCandidateInput` в `control-channel.ts` уже есть (T010), но ничто в UI его пока не вызывает (см. T026)
- [ ] T028 [US3] Backend: приём `candidate_input` в `control_channel.py` (T008) — только пересылка/сохранение в `Answer.code_snapshots`, БЕЗ интерпретации содержимого и БЕЗ влияния на переходы (FR-011)
- [X] T029 [US3] Reconnect: `reconnecting`-статус в `control-channel.ts` (T010) на аномальном разрыве + повтор WS-хендшейка с тем же `access_token`, отражается в `InterviewRoom.tsx` (`StatusLine`) — покрыто vitest (`control-channel.test.ts`)
- [ ] T030 [P] [US3] Флаг `--publish-redis` в `live-agent/scripts/simulate.py` — публикует события T005 в Redis без реального LiveKit/STT/TTS (`quickstart.md`, Сценарий A)
- [X] T031 [US3] `backend/tests/test_interview_ws.py` + `test_control_channel.py` (pytest) — `test_interview_ws.py` гоняет полный цикл на `fakeredis`+SQLite (handshake, коды закрытия, relay Redis→ControlEvent→WS, закрытие на `completed`) реальной асинхронной оркестрацией, не моком
- [X] T032 [US3] `live-agent/tests/test_control_bridge.py` (pytest) — `RedisEventSink` публикует идентичный payload тому, что уходит в `EventLog`, файл `out/*.jsonl` не меняется по формату (регрессия на `live-agent/CLAUDE.md` правило 5)

**Checkpoint**: все три P1-стори работают независимо и вместе; control-канал закрывает
основной открытый архитектурный вопрос фичи

---

## Phase 6: User Story 4 — Live-coding редактор (Priority: P2)

**Goal**: для `format=live_coding` экран переключается в редактор кода, видеотайлы
сворачиваются, `code_snapshots[]` фиксируются периодически (`spec.md`, US4)

**Independent Test**: пройти один `live_coding`-вопрос (мок-вакансия
`live-agent/mock_data/interview_example.json`), проверить непрерывный видео/аудио-сегмент
и непустые `code_snapshots[]` в `Answer`

### Implementation for User Story 4

- [X] T033 [P] [US4] Добавить редактор кода (CodeMirror 6, `@uiw/react-codemirror` — решение пользователя, не Monaco: легче, проще подключить подсветку без указанного языка) в зависимости `frontend/package.json`
- [X] T034 [US4] `frontend/components/interview/CodeEditorPanel.tsx` — активируется в `InterviewRoom.tsx`, когда `ControlEvent.input_format=code`; видеотайлы сворачиваются в угол (уменьшенный вариант того же блока, не отдельный компонент)
- [X] T035 [US4] Периодический захват кода — НЕ отдельный клиентский таймер: `onChange` редактора дебаунсится (1.5с) и уходит как `candidate_input` по control-каналу (уже существующий `sendCandidateInput`), backend пишет каждое такое сообщение в `Answer.code_snapshots` (`interview_event_service.record_candidate_input`) и пересылает live-agent через командный Redis-канал (`interview_ws.py`, `code_update`) — закрывает и «известный gap» ниже (агент видит код по мере набора, не только на finalize)
- [X] T036 [US4] `frontend/components/interview/CodeEditorPanel.test.tsx` (vitest) — рендер редактора вместо тайлов, дебаунс-отправка кода, выбор языка при отсутствующем `stimulus.language`

**Checkpoint**: все user story независимо функциональны; US4 — единственная,
формально не блокирующая MVP (Priority P2)

**Известный gap — закрыт иначе, чем предполагал этот план**: `spec.md`, US4, Acceptance
Scenario 2/3 (сигнал «печатает, но молчит», устный вопрос вдогонку) реализованы не через
отдельный протокольный сигнал «печатает», а через `live-agent`: во время решения задачи
(`state_machine.Phase.CODING`, отдельный `CODING_SYSTEM_PROMPT`) агент сам следит за
бездействием (код не меняется, реплик нет) и инициирует голосовую подсказку у LLM; кандидат
переводит вопрос в фазу объяснения голосом («я закончил» и т.п., тоже LLM-классификация, без
кнопки на фронте). Жёсткие per-question лимиты — не более 3 подсказок во время решения и не
более 3 доп. вопросов на фазе объяснения (`state_machine.CODING_HINT_LIMIT`/
`CODING_FOLLOWUP_LIMIT`), отдельные от общих `adaptive_budget_remaining`/`hint_used`
voice-вопросов. Генерация вопросов (`vacancy_question_set.txt`) может (не обязана —
для нетехнических вакансий остаётся `voice`) сделать последний assessment-вопрос
`format=live_coding`. Подробности — `live-agent/README.md`, раздел `format="live_coding"`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T037 Прогнать `quickstart.md`, Сценарий A, end-to-end вручную, зафиксировать результат в PR
- [ ] T038 [P] Обновить `live-agent/README.md` — задокументировать `RedisEventSink` как аддитивный sink рядом с `EventLog` (протокол событий не поменялся, но появился второй потребитель)
- [ ] T039 [P] Обновить `backend/README.md` — новые эндпоинты (`/ws/interview`, `/interview/{token}`, `livekit-token`, `answers/.../chunks`+`finalize`), новые переменные окружения (T002)
- [ ] T040 [P] Обновить `frontend/README.md` — статус candidate flow меняется с «пустой заглушки» на реализованный
- [ ] T041 Обновить `specs/004-candidate-interview-flow/spec.md`, раздел «Синхронизация с кодом» — статус по факту реализации

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей
- **Foundational (Phase 2)**: зависит от Setup — блокирует US2/US3/US4 (не блокирует US1, см. Notes)
- **US1 (Phase 3)**: зависит только от Setup — может вестись параллельно с Phase 2
- **US2 (Phase 4)**: зависит от Foundational (control-канал + LiveKit-токен) и от `DeviceCheck` из US1 (T014, публикует камеру/микрофон в LiveKit)
- **US3 (Phase 5)**: зависит от Foundational; расширяет UI из US2 (T017/T022) — естественный порядок US2 → US3, хотя формально независимо тестируема на фейковом потоке (T030) без готового US2-layout
- **US4 (Phase 6)**: зависит от US3 (T026, `AnswerInput` с условным рендером по `input_format`)
- **Polish (Phase 7)**: после выбранного набора user story

### Within Each User Story

- Backend-эндпоинт → frontend-интеграция, в этом порядке внутри фазы (контракт уже
  зафиксирован в `contracts/`, поэтому frontend-таск может стартовать параллельно, если
  описан в `contracts/`, а не ждать реального backend — см. Parallel Opportunities)
- Redis-мост (T005/T006) и WS-эндпоинт (T007-T009) — параллельны друг другу, оба нужны
  для checkpoint Phase 2

### Parallel Opportunities

- T002, T003 — параллельно (разные файлы/сервисы)
- T010, T011 — параллельно с T007-T009 (разные файлы, контракт уже зафиксирован)
- T013 (frontend-согласие) — параллельно с T012 (backend), т.к. `contracts/`-эквивалент — сам `spec.md` US1 Acceptance Scenario 1 уже фиксирует форму ответа
- T018 (LiveKit-клиент) — параллельно с T020/T021 (answer-upload) — разные подсистемы
- T030 (simulate.py флаг) — параллельно с T025-T029 (frontend/backend control-канал), нужен для их проверки, но не для написания кода
- T033 — параллельно с остальным Phase 5 (просто добавление зависимости)
- T038, T039, T040 — параллельно

---

## Parallel Example: Foundational (Phase 2)

```bash
# Redis-мост (live-agent) и WS-эндпоинт (backend) не пересекаются файлами:
Task: "RedisEventSink в live-agent/src/ainterviewer/control_bridge.py"
Task: "WS-эндпоинт в backend/app/routers/interview_ws.py"
Task: "frontend/lib/control-channel.ts — WS-клиент по уже зафиксированному contracts/control-channel.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 3 (US1), не дожидаясь Phase 2 (Foundational)
2. **STOP and VALIDATE**: `spec.md`, US1 Acceptance Scenarios — согласие, live-превью,
   блокировка при отказе
3. Демонстрируемо уже здесь: юридически обязательный шаг (раздел 6 архитектурного
   документа) — самый рискованный с точки зрения комплаенса кусок фичи

### Incremental Delivery

1. Setup (+ US1 параллельно) → Foundational → control-канал end-to-end на фейковом потоке
2. US2 → демо «видеозвонок-подобный интерфейс» на фейковом потоке (T030) или частично на реальном `live-agent`
3. US3 → закрывает главный архитектурный вопрос фичи (разделение ответственности FE/BE/live-agent) — демо reconnect + `candidate_input`
4. US4 → демо `live_coding`, с явно зафиксированным gap по триггеру неактивности (см. Phase 6)
5. Каждая story добавляет ценность, не ломая предыдущие

---

## Notes

- US1 — единственная story этой фичи без зависимости от Foundational (Phase 2): чистый
  frontend + браузерные API. Можно вести параллельно с Phase 2, если позволяет
  распределение по людям/агентам.
- US2/US3 предметно пересекаются (оба про то, как control-канал доходит до UI) —
  разделены по `spec.md`, но их checkpoint естественно общий: полноценно
  продемонстрировать «видеозвонок» без «переходы строго по решению агента» бессмысленно.
  Порядок T017→T022 (US2) затем T025→T029 (US3) — рабочий, не единственно верный.
- Каждый backend-таск, добавляющий эндпоинт/WS-сообщение, должен сверяться с
  `contracts/` (Constitution, Principle IV) — не вводить недокументированные поля.
- Известный незакрытый вопрос сверх этого плана — US4 Acceptance Scenario 2/3 (см. Phase 6,
  «Известный gap») и открытые edge cases из `spec.md` (повторное открытие пройденной
  ссылки) — сознательно не в скоупе `tasks.md`, требуют отдельного уточнения до
  реализации, если понадобятся для демо.
