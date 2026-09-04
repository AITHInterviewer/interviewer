# Frontend

Новый frontend-каркас на `Next.js + TypeScript + Tailwind + shadcn/ui`.

## Статус

- `/` — пустая стартовая страница.
- `/interview/[token]` — согласие → device-check → control-канал (WS) + LiveKit-звонок
  (specs/004-candidate-interview-flow, US1-US3). Answer-upload (`MediaRecorder` по
  вопросам) и live_coding-редактор не реализованы — см. `tasks.md` той фичи, T020-T022,
  T033-T036.
- `getUserMedia` подключён (device-check); `MediaRecorder`/`speechSynthesis` не нужны —
  голос идёт через LiveKit (`lib/livekit-client.ts`), не через браузерный `MediaRecorder`
  на каждую реплику.

## Стек

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui**

## Установка и запуск

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Приложение будет доступно на `http://localhost:3000`.

## Команды

```bash
npm run lint
npm run build
```

## Docker

```bash
docker compose -f ../docker-compose.dev.yml up --build
```

Для сервис-локального запуска остаётся `frontend/docker-compose.yml`, но canonical happy path для локальной FE/BE разработки находится в корне репозитория.

## Конфигурация

- `NEXT_PUBLIC_BACKEND_URL` используется браузером
- `BACKEND_INTERNAL_URL` используется frontend-контейнером для server-side проверки backend
- оба значения задаются через `frontend/.env`

## Зависимости и образ

- зависимости управляются через `package.json` и `package-lock.json`
- Docker-образ не требует отдельной ручной установки Node tooling вне проекта
- тот же Dockerfile используется для локального baseline и CI-сборки

## Дальше

- Собрать recruiter dashboard заново.
- Реализовать candidate interview UI на browser APIs.
- Подключить frontend к новому backend API.
