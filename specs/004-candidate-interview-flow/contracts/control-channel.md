# Contract: Control-канал (WebSocket, frontend ↔ backend)

`GET /ws/interview/{access_token}` (backend, тот же процесс/порт что REST — см.
`research.md` п.1). Единственная точка входа кандидатского UI в backend (FR-009) — этот
контракт полностью описывает, что может прийти и уйти по этому соединению; ничего сверх
этого списка.

## Handshake

- Клиент открывает WS на `/ws/interview/{access_token}`.
- Backend валидирует `access_token` (существует, `Interview.status IN (created, in_progress)`).
  - Невалиден/не найден → закрыть с кодом `4401`.
  - `status = completed` → закрыть с кодом `4409` (уже пройдено — см. `spec.md`, Edge Cases, открытый вопрос повторного открытия ссылки; для WS это минимум — не пускать в активную сессию).
- Успех → backend подписывается на Redis-канал `live-agent:events:{interview_id}` (см.
  `research.md` п.2) и держит соединение открытым до `completed`/разрыва.

## Сообщения backend → frontend: `ControlEvent`

Схема — `data-model.md`, раздел `ControlEvent`. JSON, одно сообщение — один объект
(не пакетами).

```json
{"type": "question", "question_id": "q-3", "text": "Расскажите про индексы в Postgres", "input_format": "none", "ts": "2026-09-04T10:00:00Z"}
```

```json
{"type": "adaptive_question", "question_id": "q-3", "text": "А что если запрос делает seq scan несмотря на индекс?", "input_format": "none", "ts": "2026-09-04T10:01:30Z"}
```

```json
{"type": "reconnect_status", "question_id": null, "text": null, "input_format": null, "ts": "2026-09-04T10:02:00Z"}
```
— `reconnect_status` использует зарезервированное поле `payload.status` (`"reconnecting" | "restored"`), которое не входит в базовую таблицу `data-model.md` (специфично для этого одного типа, не для остальных).

```json
{"type": "completed", "question_id": null, "text": "Спасибо, ответы отправлены на обработку", "input_format": null, "ts": "2026-09-04T10:20:00Z"}
```
— backend закрывает соединение (код `1000`) сразу после отправки.

## Сообщения frontend → backend: `CandidateInput`

Единственный тип сообщения от кандидата в этом канале — явный ввод для форматов,
требующих поля ввода (`input_format != none`, см. `data-model.md`). Голосовой ответ НЕ
идёт через этот канал (см. п.3 `research.md` — LiveKit) и запись ответа НЕ идёт через
этот канал (см. `contracts/answer-upload.md`).

```json
{"type": "candidate_input", "question_id": "q-5", "input_format": "code", "content": "def two_sum(nums, target): ..."}
```

Backend НЕ интерпретирует `content` и не принимает решений на его основе (FR-011) —
только пересылает как есть в сторону live-agent-моста (конкретный механизм — предмет
`tasks.md`, не этого контракта) и/или сохраняет как промежуточный `code_snapshots[]` для
`Answer` (см. `data-model.md`).

## Коды закрытия

| Код | Когда |
|---|---|
| `1000` | Штатное завершение после `completed` |
| `4401` | Невалидный/не найденный `access_token` |
| `4409` | Интервью уже завершено (`status=completed`) |
| `1006`/аномальный разрыв | Сеть — frontend переходит в `reconnecting` (см. `data-model.md`, client-side state) и повторяет handshake с тем же `access_token`; сервер не восстанавливает пропущенные `ControlEvent` задним числом (см. `spec.md`, Edge Cases) |
