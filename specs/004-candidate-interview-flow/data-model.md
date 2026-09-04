# Phase 1 Data Model: Кандидат — прохождение видеоинтервью

`Interview`/`Question` уже определены в
[specs/003-recruiter-vacancy-management/data-model.md](../003-recruiter-vacancy-management/data-model.md)
и владеются той фичей — здесь не переопределяются, только читаются. Эта фича добавляет
`Answer` (персистентная сущность) и `ControlEvent`/`LiveKitTokenRequest` (протокольные,
не персистентные — WS/REST payload-схемы, но задокументированы здесь как контракт данных).

## Answer (новая, персистентная — Postgres)

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `interview_id` | UUID FK → interview.id | not null |
| `question_id` | UUID FK → question.id | not null |
| `role` | enum(`assessment`, `warmup`, `closing`) | not null, скопировано с `Question.role` на момент записи (раздел 2.3, п.3/п.6 — batch-контур не должен джойнить `Question` заново, чтобы понять, оценивать ли ответ) |
| `video_url` | text | nullable — ключ объекта в MinIO (`MediaRecorder`-чанки, склеенные на аплоаде) |
| `audio_url` | text | nullable |
| `transcript_text` | text | nullable — черновой транскрипт из `live-agent`-протокола, если событие пришло; batch-контур переозвучивает точным ASR отдельно |
| `code_submission` | text | nullable — только для `format=live_coding` |
| `code_language` | text | nullable — только для `format=live_coding` |
| `code_snapshots` | jsonb | `[{ts, content}]`, default `[]` — только для `format=live_coding`, см. spec US4 |
| `started_at` | timestamptz | not null |
| `completed_at` | timestamptz | nullable |

**Инвариант**: `format=live_coding` ⇒ ровно один `Answer` на вопрос, один непрерывный
`video_url`/`audio_url`-сегмент (FR-003); остальные форматы — тоже один `Answer` на
вопрос, но без code-полей.

## ControlEvent (протокольная — WS-сообщение backend→frontend)

Отображение из `live-agent`-протокола ([[001-live-interview-contour]], `events.py`,
`EventType`) в то, что реально нужно кандидатскому UI — не 1:1 (см. таблицу маппинга
ниже), backend не добавляет сюда никакой собственной семантики (FR-011).

| Поле | Тип | Обязательность |
|---|---|---|
| `type` | enum(`question`, `checkin`, `adaptive_question`, `transition`, `completed`, `reconnect_status`) | not null |
| `question_id` | string \| null | обязателен для `question`/`checkin`/`adaptive_question` |
| `text` | string \| null | реплика агента (TTS-текст), если применимо |
| `input_format` | enum(`none`, `text`, `code`) \| null | обязателен для `question`/`adaptive_question` — определяет, показывать ли поле ввода и какое (см. таблицу форматов ниже) |
| `code_language` | string \| null | только когда `input_format=code` |
| `ts` | ISO8601 datetime | not null |

### Маппинг `live-agent` `EventType` → `ControlEvent.type`

| `EventType` (источник) | `ControlEvent.type` | Примечание |
|---|---|---|
| `question_started` | `question` | новый вопрос — client-side state machine сбрасывает состояние поля ввода |
| `checkin_used` | `checkin` | |
| `adaptive_question_asked` | `adaptive_question` | |
| `question_completed` → следующий `question_started` | `transition` затем `question` | backend эмитит `transition` до `question`, чтобы UI мог показать переходную анимацию/паузу (не обязателен для MVP, но зарезервирован в схеме) |
| `interview_completed` | `completed` | закрывает WS соединение со стороны backend после отправки |
| `backchannel_played`, `candidate_utterance`, `live_control_decision`, `agent_utterance`, `interview_started` | *(не транслируется)* | внутренние/избыточные для UI — TTS/бэкчаннел кандидат и так слышит через LiveKit-аудио, дублировать текстом не нужно |
| *(нет источника в `live-agent`)* | `reconnect_status` | генерируется backend-ом локально при потере/восстановлении подписки на Redis-канал, не из `live-agent` |

### `input_format` по `Question.format` (см. [[003-recruiter-vacancy-management]])

| `Question.format` | `input_format` | Поле ввода на экране |
|---|---|---|
| `voice` | `none` | нет — только TTS/субтитры |
| `code_review_verbal` | `none` | нет — код показывается как `stimulus`, ответ голосом |
| `live_coding` | `code` | редактор кода на весь экран (US4), `code_language` — из `Question.stimulus.language` |

Явного текстового формата ввода (`input_format=text`) в текущих `Question.format`
([[003-recruiter-vacancy-management]], `data-model.md`) нет — зарезервировано в схеме
`ControlEvent` на случай будущего текстового формата вопроса, сейчас не используется
ни одним значением `Question.format`.

## LiveKitTokenRequest / Response (протокольная — REST)

См. `contracts/livekit-token.md` за полной схемой; кратко — `{access_token}` пути →
`{token, room_name, ws_url, expires_at}`.

## Client-side interview state (frontend-only, не персистентное)

Не сущность бэкенда — состояние `lib/control-channel.ts` reducer, перечислено здесь
для полноты, т.к. на него ссылается `research.md` п.5 и `contracts/control-channel.md`:

`consent` → `device_check` → `device_denied` (возврат в `device_check` по ретраю) →
`connecting` (WS + LiveKit rooms устанавливаются) → `question_active` → (`checkin` |
`adaptive_question` — оба возвращаются в `question_active`) → `transition` →
`question_active` (следующий вопрос) → ... → `completed`. `reconnecting` — оверлей поверх
любого состояния кроме `consent`/`device_check`/`completed`, не отдельная ветка графа.

## Relationships

```
Interview 1───* Answer (question_id FK → Question, тот же Interview)
Question 1───* Answer (обычно 1:1 в рамках одного интервью, кроме повторных попыток — вне скоупа MVP)
Interview 1───1 LiveKit room (room_name = interview_id)
Interview 1───1 control-канал WS-соединение (активно, пока кандидат на странице интервью)
```
