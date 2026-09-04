# Contract: LiveKit access token issuance (REST)

`POST /interview/{access_token}/livekit-token`

Выдаёт кандидатскому браузеру токен для подключения к LiveKit room, в которой уже (или
вот-вот) присутствует `live-agent`-джоб для этого интервью. Backend — единственный, кто
подписывает токен (использует dev-ключи `devkey`/`secret`, `infra/docker-compose.yml`,
`LIVEKIT_KEYS`) — frontend никогда не видит секрет.

## Request

Без тела — `access_token` в пути, тот же, что валидирует WS-хендшейк
(`contracts/control-channel.md`).

## Response `200`

```json
{
  "token": "<jwt>",
  "room_name": "<interview_id>",
  "ws_url": "ws://localhost:3907",
  "expires_at": "2026-09-04T12:00:00Z"
}
```

- `room_name` = `Interview.id` (см. `research.md` п.3) — не `access_token` (не палим
  токен доступа в LiveKit-метаданных комнаты, которые технически видны другим участникам
  комнаты, если такие появятся).
- `token` — LiveKit-JWT с правами `roomJoin=true`, `canPublish=true`, `canSubscribe=true`,
  identity = `candidate-{interview_id}` (не ФИО — см. `spec.md`, FR-007, не собираем лишних
  идентифицирующих данных сверх нужного).

## Errors

| Код | Когда |
|---|---|
| `404` | `access_token` не найден |
| `409` | `Interview.status = completed` |

## Когда вызывается

После успешного `device_check` (см. `data-model.md`, client-side state — переход
`device_check → connecting`), до открытия WS control-канала или параллельно с ним — оба
должны быть готовы до перехода в `question_active`.
