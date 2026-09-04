# Contract: Answer upload (REST, чанковая загрузка `MediaRecorder`)

Реализует FR-003 (spec.md): запись ответа на каждый вопрос отдельным файлом (один
непрерывный сегмент для `live_coding`), загрузка чанками. Не связан с control-каналом
(FR-012 — медиа не идёт через WS) и не связан с LiveKit egress (`research.md` п.4 — это
отдельная, полная запись звонка, не по-вопросная).

## `POST /interview/{access_token}/answers/{question_id}/chunks`

Тело — `multipart/form-data`: один чанк `MediaRecorder`-потока (`Blob`), плюс поля:

| Поле | Тип | Обязательность |
|---|---|---|
| `chunk_index` | int | not null, начиная с 0 |
| `mime_type` | string | not null (напр. `video/webm;codecs=vp8,opus`) |

Backend буферизует чанки по `(interview_id, question_id)` во временное хранилище,
склеивает при `finalize`.

Response `202` — чанк принят, `{received_chunk_index}`.

## `POST /interview/{access_token}/answers/{question_id}/finalize`

Завершает запись текущего вопроса — склеивает принятые чанки в один объект, кладёт в
MinIO, создаёт/обновляет `Answer` (`data-model.md`) с `video_url`/`audio_url`,
`completed_at`. Для `format=live_coding` тело дополнительно содержит
`{code_submission, code_language, code_snapshots}` (см. `data-model.md`).

Response `201`:

```json
{"answer_id": "a-1", "question_id": "q-3", "video_url": "s3://.../a-1.webm"}
```

## Когда вызывается

`chunks` — по мере накопления `MediaRecorder`-данных на текущем вопросе (частота — по
умолчанию `MediaRecorder`-таймслайсу, конкретное значение — `tasks.md`, не контракт).
`finalize` — сразу после того, как control-канал прислал `ControlEvent` со сменой
вопроса (`type=transition`/следующий `question`) или `completed` — frontend не решает
сам, когда вопрос закончен (FR-008/FR-011), только реагирует на уже пришедшее решение
графа, останавливая `MediaRecorder` и вызывая `finalize` для только что завершённого
`question_id`.

## Errors

| Код | Когда |
|---|---|
| `404` | `access_token`/`question_id` не найден или не принадлежит этому интервью |
| `409` | `finalize` вызван повторно для уже финализированного `question_id` |
| `413` | Чанк превышает лимит размера (значение — `tasks.md`) |
