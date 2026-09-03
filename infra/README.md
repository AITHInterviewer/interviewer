# infra

Общая инфраструктура, которую делят несколько сервисов — не дублируется в
`docker-compose.yml` отдельных сервисов (см. корневой [README.md](../README.md)).

## Статус

✅ `docker compose config` проходит без ошибок из корня репозитория (реально
проверено — нашла и починила там же реальную YAML-опечатку в `LIVEKIT_KEYS`).
⚠️ `livekit-egress-config.yaml` создан по документации LiveKit, ни разу не проверялся
вживую (нет реальной WebRTC-комнаты с записью в этом проекте на момент написания).
Бакет `ainterviewer-recordings` в MinIO конфиг не создаёт сам — см. TODO в файле.

## Что внутри

| Сервис | Зачем | Порт |
|---|---|---|
| `postgres` | БД backend | 5432 |
| `redis` | Очередь для evaluation-agent | 6379 |
| `minio` | S3-совместимое хранилище видео/аудио (раздел 4 архитектурного документа) | 9000 (API), 9001 (консоль) |
| `livekit-server` | WebRTC SFU — комнаты кандидат↔live-agent | 7880-7881, 50000-50100/udp |
| `livekit-egress` | Запись комнаты в S3 (см. «Как реально пишется запись» в архитектурном документе) | — |

## Запуск

```bash
docker compose up -d
```

**dev-ключи `devkey`/`secret` захардкожены в `docker-compose.yml` — только для локали
и CI, ни в коем случае не для прода.**

MinIO-консоль: http://localhost:9001 (ainterviewer / ainterviewer123 — тоже dev-only).
