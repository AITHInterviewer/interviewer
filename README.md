# aith-hackaton-interviewer

Репозиторий содержит несколько сервисов, но локальный happy path для повседневной разработки теперь отделён от полного multi-service compose.

## Локальный baseline для frontend + backend

1. Убедитесь, что существуют `frontend/.env` и `backend/.env`.
2. Из корня репозитория запустите:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Baseline поднимает только:
- `frontend`
- `backend`

Исключено из happy path:
- `live-agent`
- `evaluation-agent`
- прочие сервисы, не нужные для базовой FE/BE разработки

После старта ожидается:
- frontend: `http://localhost:3000`
- backend health: `http://localhost:8000/health`

## Полный compose из корня

Файл `docker-compose.yml` остаётся root entrypoint для более широкого multi-service сценария. Он включает `infra/`, `live-agent/`, `evaluation-agent/`, `backend/` и `frontend/`.

Этот режим не является локальным baseline для ежедневной разработки FE/BE и может падать по причинам, не связанным с core-сервисами.

## Порты проекта

Выделенный пул портов для этого проекта (кроме frontend/backend — оставлены на
общепринятых 3000/8000). Диапазон `39xx` выбран специально, чтобы не пересекаться с
портами других проектов на общих машинах (см. `deploy-full.yml` — реальный инцидент:
чужой контейнер `react-agent-stt` занял стандартный `9000`, который до этого использовал
наш `minio`).

| Сервис | Порт | Где определён |
|---|---|---|
| frontend | 3000 | `docker-compose.dev.yml` |
| backend | 8000 | `docker-compose.dev.yml` |
| postgres | 3901 | `infra/docker-compose.yml` |
| redis | 3902 | `infra/docker-compose.yml` |
| minio API | 3903 | `infra/docker-compose.yml` |
| minio консоль | 3904 | `infra/docker-compose.yml` |
| live-agent stt | 3905 | `live-agent/docker-compose.yml` |
| live-agent tts | 3906 | `live-agent/docker-compose.yml` |
| livekit signaling | 3907 | `infra/docker-compose.yml` |
| livekit tcp fallback | 3908 | `infra/docker-compose.yml` |
| livekit media (UDP) | 50000-50100 | `infra/docker-compose.yml` (не менялся — отдельная проблема с Windows-раннером, см. `deploy-full.yml`) |

Новый сервис — занимай следующий свободный номер в диапазоне (3909, 3910, …), не
дефолтный порт образа.

## Отдельные сервисы

- `frontend/` хранит собственные Node/Next зависимости, Dockerfile и `.env`-конфигурацию
- `backend/` хранит собственные Python/uv зависимости, Dockerfile и `.env`-конфигурацию

Это позволяет:
- переиспользовать те же образы в CI
- собирать `frontend` и `backend` независимо
- хостить сервисы раздельно при необходимости
