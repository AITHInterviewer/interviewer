# Phase 0 Research: Кандидат — прохождение видеоинтервью

Каждый пункт закрывает один `NEEDS CLARIFICATION`/открытый архитектурный вопрос из
`spec.md` (FR-009..FR-012) и из обсуждения с пользователем. Формат: Decision /
Rationale / Alternatives considered.

## 1. Транспорт control-канала: WebSocket на существующем backend-процессе

**Decision**: `GET /ws/interview/{access_token}` — WebSocket-эндпоинт в том же FastAPI
ASGI-приложении, что и REST (`backend/app/main.py`), тот же порт `8000`. Аутентификация —
`access_token` интервью в пути (тот же токен, что в URL `/interview/[token]`, владеет
[[003-recruiter-vacancy-management]]); соединение отклоняется (`4401`) для невалидного
или уже завершённого (`status=completed`) токена.

**Rationale**: FastAPI/Starlette поддерживают WebSocket на том же ASGI-приложении без
дополнительного процесса или порта — соответствует Constitution V (Minimalism). Токен в
пути, а не в query/заголовке — переиспользует уже принятую модель доступа кандидата без
аккаунта ([[003-recruiter-vacancy-management]], раздел «Роли и границы»), не вводит
второй механизм аутентификации.

**Alternatives considered**: отдельный WS-микросервис на новом порту (`39xx` по
конвенции `README.md`, «Порты проекта») — отклонено, лишний процесс/деплой без
демонстрируемой необходимости на MVP-масштабе (Constitution V); Server-Sent Events
вместо WS — отклонено, т.к. кандидату может понадобиться отправлять `candidate_input`
(текст/код) в тот же канал (см. `contracts/control-channel.md`), SSE — только сервер→клиент.

## 2. Мост backend↔live-agent: аддитивный Redis pub/sub sink, без изменения `EventLog`

**Decision**: `live-agent` добавляет `control_bridge.RedisEventSink` — публикует то же
`Event` (`events.py`, без изменений схемы) в Redis-канал `live-agent:events:{interview_id}`
**параллельно** с существующим `EventLog.emit()` (файловый `out/<id>.jsonl` не трогается).
`backend` подписывается на этот канал на время активного WS-соединения кандидата и
транслирует подмножество событий в `ControlEvent` (см. `data-model.md`).

**Rationale**: `live-agent/CLAUDE.md`, правило 5 — `EventLog` только на дозапись, формат
`EventType`/`Event` менять нельзя без обновления README; аддитивный sink не трогает ни
то, ни другое — тот же `Event`, второй получатель. Redis уже поднят в `infra/`
(`redis:3902`) и уже заявлен как стандарт межсервисной шины в Technology Constraints
конституции (`evaluation-agent` тоже должен использовать Redis для очереди) — не вводит
новую технологию в стек.

**Alternatives considered**:
- **(a) backend делает `tail -f`/watch файла `out/<id>.jsonl`** — отклонено: файл лежит в
  volume `live-agent`-контейнера, требует либо shared volume между сервисами (лишняя
  связанность деплоя), либо polling с задержкой; не даёт чистого «подписка на конкретный
  interview_id», только «весь файл целиком».
- **(c) `live-agent` сам держит исходящий WS/HTTP callback к backend** — отклонено:
  добавляет `live-agent`-у ответственность за реконнект/ретраи к произвольному
  backend-адресу, усложняет именно тот сервис, чьи правила (`CLAUDE.md`) явно просят не
  трогать лишнего; pub/sub развязывает время жизни publisher/subscriber естественно
  (backend может переподключаться к Redis независимо от того, жив ли ещё
  live-agent-процесс).

## 3. Медиатранспорт кандидат↔live-agent: LiveKit room

**Decision**: браузер кандидата подключается к LiveKit room (`livekit-client` JS SDK) с
`room_name = interview_id`; `backend` выпускает LiveKit access token через
`livekit-api` (Python SDK), используя уже сконфигурированные dev-ключи `devkey/secret`
(`infra/docker-compose.yml`) — см. `contracts/livekit-token.md`.

**Rationale**: уже принятое решение [[001-live-interview-contour]] — `live-agent`
использует LiveKit Agents для VAD/turn-taking/STT-TTS-оркестрации; кандидат должен
попасть в ту же комнату, не изобретать второй WebRTC-стек.

**Alternatives considered**: нет — это прямое следствие уже сделанного выбора в
[[001-live-interview-contour]], не заново открытый вопрос.

## 4. Запись: два независимых механизма для двух целей

**Decision**:
- **Ответ на конкретный вопрос** (вход для batch-контура, `Answer.video_url`/`audio_url`,
  FR-003) — `MediaRecorder` на клиенте, чанками по HTTP на `answer-upload` (см.
  `contracts/answer-upload.md`), один файл на вопрос (один сегмент на весь вопрос для
  `live_coding`), как уже зафиксировано в FR-003.
- **Весь звонок целиком** (явное требование пользователя — «звонок должен записываться
  полностью», не только по вопросам) — LiveKit room composite egress
  (`infra/livekit-egress-config.yaml`, уже сконфигурирован, ни разу не проверен вживую —
  см. `infra/docker-compose.yml` комментарий) пишет непрерывную запись комнаты в MinIO.

**Rationale**: у этих двух записей разные потребители и разный формат — `Answer`
собирается batch-контуром по `question_id` и должна быть нарезана по вопросам заранее
(иначе batch-контуру придётся самому резать по таймкодам, что не входит в его текущий
контракт, [[005-batch-evaluation-contour]]); полная запись звонка — комплаенс/доказательный
артефакт для рекрутёра/аудита (раздел 6 архитектурного документа — запись как evidence),
её не нужно резать по вопросам вообще. LiveKit egress уже подготовлен инфраструктурно —
переиспользуется, не добавляется новый механизм записи.

**Alternatives considered**: только LiveKit egress + пострезка на backend по
`ControlEvent`-таймкодам вместо `MediaRecorder` — отклонено на этой итерации: требует
доп. пайплайна нарезки видео на backend, которого сейчас нет, тогда как `MediaRecorder`
уже был зафиксирован в спеке (FR-003) до этого обновления и не оспаривался пользователем;
пересмотр — тема отдельного спека, если пострезка понадобится.

## 5. Frontend: один client-side state machine, не переключение "страниц"

**Decision**: `lib/control-channel.ts` держит один reducer/state machine, значения
которого выводятся исключительно из входящих `ControlEvent` (плюс локальные
device/connection-статусы). `interview-room.tsx` — единственный компонент экрана
интервью, рендерит по текущему состоянию (вопрос/чек-ин/адаптивный вопрос/поле ввода/
`live_coding`-редактор), не по client-side роутингу между отдельными URL на каждый шаг.

**Rationale**: прямое следствие FR-008/FR-011 (spec.md) — если бы переходы жили в
роутинге фронта, это было бы вторым источником истины о том, «на каком мы шаге»,
дублирующим граф `LiveContourEngine`.

**Alternatives considered**: Next.js динамические под-роуты на шаг интервью — отклонено,
именно та дублирующая логика перехода, которую FR-008 запрещает.
