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

- [ ] T004 ORM-модель `Answer` в `backend/app/models/answer.py` + Alembic-миграция в `backend/app/migrations/versions/` (см. `data-model.md`, раздел `Answer`)
- [X] T005 [US-agnostic] Реализовать `RedisEventSink` в `live-agent/src/ainterviewer/control_bridge.py` — публикует тот же `Event` (`events.py`, БЕЗ изменения схемы) в канал `live-agent:events:{interview_id}` **параллельно** с `EventLog.emit()` (см. `research.md` п.2 — аддитивно, `live-agent/CLAUDE.md` правило 5 не нарушается)
- [X] T006 Подключить `RedisEventSink` рядом с `EventLog` в `live-agent/src/ainterviewer/agent.py` — каждый `emit()` идёт в оба sink
- [ ] T007 WS-эндпоинт `GET /ws/interview/{access_token}` (хендшейк/валидация токена, коды закрытия `4401`/`4409`) в `backend/app/routers/interview_ws.py` — см. `contracts/control-channel.md`
- [ ] T008 Сервис `backend/app/services/control_channel.py` — подписка на Redis-канал `live-agent:events:{interview_id}`, маппинг `EventType → ControlEvent` строго по таблице из `data-model.md` (без собственной логики решений — FR-011)
- [ ] T009 Подключить `interview_ws`-роутер в `backend/app/main.py`
- [ ] T010 [P] `frontend/lib/control-channel.ts` — WS-клиент + client-side state machine (состояния из `data-model.md`, раздел «Client-side interview state»), пока без UI-потребителей
- [ ] T011 [P] Реализовать `livekit_tokens.py` в `backend/app/services/` + `POST /interview/{access_token}/livekit-token` в `backend/app/routers/candidate_interview.py` — см. `contracts/livekit-token.md`

**Checkpoint**: фейковый поток событий (`live-agent` → Redis → backend → frontend
state machine) проходит целиком — US2/US3/US4 могут строить UI поверх готового канала

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

- [ ] T017 [US2] `frontend/app/interview/[token]/interview-room.tsx` — layout: `QuestionPanel` по центру, тайлы по краям, подключается к T010 (control-channel state)
- [ ] T018 [P] [US2] `frontend/lib/livekit-client.ts` — подключение браузера кандидата к LiveKit room через токен из T011 (`livekit-client` SDK), публикация камеры/микрофона из `DeviceCheck` (T014)
- [ ] T019 [US2] `frontend/components/interview/CandidateTile.tsx` (свой видеопоток) и `AgentTile.tsx` (индикация присутствия агента — LiveKit remote participant/TTS-активность)
- [ ] T020 [US2] Сервис `answer_storage.py` в `backend/app/services/` — приём чанков, склейка, запись `Answer` (T004) в MinIO — см. `contracts/answer-upload.md`
- [ ] T021 [US2] `POST /interview/{access_token}/answers/{question_id}/chunks` и `/finalize` в `backend/app/routers/candidate_interview.py`
- [ ] T022 [US2] Интеграция `MediaRecorder` в `interview-room.tsx` — старт/стоп по `question_id` из control-channel state (T010), чанки на T021, `finalize` по приходу `transition`/`completed` (зависит от T010, T021)
- [ ] T023 [US2] Рендер `ControlEvent.text` как субтитров; warmup/closing без визуального отличия (FR-005)
- [ ] T024 [US2] Финальный экран «Спасибо, ответы отправлены на обработку» по `ControlEvent.type=completed`

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

- [ ] T025 [US3] Строго связать переходы `interview-room.tsx` (T017) с `ControlEvent` — убрать любой локальный «next»-контрол, если он появился в T017/T022 как заглушка
- [ ] T026 [US3] `frontend/components/interview/AnswerInput.tsx` — условный рендер поля ввода по `ControlEvent.input_format` (таблица в `data-model.md`)
- [ ] T027 [US3] Отправка `candidate_input` по control-каналу для `input_format != none` (`contracts/control-channel.md`) — расширение `control-channel.ts` (T010)
- [ ] T028 [US3] Backend: приём `candidate_input` в `control_channel.py` (T008) — только пересылка/сохранение в `Answer.code_snapshots`, БЕЗ интерпретации содержимого и БЕЗ влияния на переходы (FR-011)
- [ ] T029 [US3] Reconnect: `reconnecting`-оверлей в `control-channel.ts` (T010) + повтор WS-хендшейка с тем же `access_token` при разрыве (`contracts/control-channel.md`, коды закрытия)
- [ ] T030 [P] [US3] Флаг `--publish-redis` в `live-agent/scripts/simulate.py` — публикует события T005 в Redis без реального LiveKit/STT/TTS (`quickstart.md`, Сценарий A)
- [ ] T031 [US3] `backend/tests/test_interview_ws.py` + `test_control_channel.py` (pytest) — фейковые Redis-события → корректная последовательность `ControlEvent`, backend не меняет и не переупорядочивает решения
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

- [ ] T033 [P] [US4] Добавить редактор кода (Monaco или CodeMirror) в зависимости `frontend/package.json`
- [ ] T034 [US4] `frontend/components/interview/CodeEditorPanel.tsx` — активируется, когда `AnswerInput` (T026) получает `input_format=code`; видеотайлы (T019) сворачиваются в угол
- [ ] T035 [US4] Периодический захват `code_snapshots` (таймер, содержимое редактора) — включаются в `finalize`-запрос (T021, `contracts/answer-upload.md`, поле `code_snapshots`)
- [ ] T036 [US4] `frontend/components/interview/CodeEditorPanel.test.tsx` (vitest) — рендер редактора вместо тайлов, снапшоты попадают в `finalize`-payload

**Checkpoint**: все user story независимо функциональны; US4 — единственная,
формально не блокирующая MVP (Priority P2)

**Известный gap (не закрывается этим планом)**: `spec.md`, US4, Acceptance Scenario 2
(двойная неактивность печати+голоса триггерит реактивный цикl) и Scenario 3 (устный
вопрос вдогонку при скудном narration) — логика на стороне `live-agent`, не
исследованная в `research.md` этой фичи (нет контракта на сигнал «печатает, но молчит» в
`live-agent`-протокол). Требует отдельного `speckit-clarify`/дополнения `research.md`
перед реализацией — не блокирует T033–T036 (сам редактор и захват снапшотов не зависят
от этого триггера).

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
