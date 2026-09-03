# Frontend

Новый frontend-каркас на `Next.js + TypeScript + Tailwind + shadcn/ui`.

## Статус

- `/` — пустая стартовая страница.
- `/interview/[token]` — пустой candidate flow без интеграции с backend.
- `getUserMedia`, `MediaRecorder` и `speechSynthesis` пока только запланированы, не подключены.

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
