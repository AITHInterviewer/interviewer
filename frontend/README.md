# Frontend

Новый frontend-каркас на `Next.js + TypeScript + Tailwind + shadcn/ui`.

## Статус

- `/` — внутренний entrypoint с редиректом на login или role-specific protected area.
- `/register` — self-signup первого рекрутёра.
- `/login` — общий вход для `recruiter`, `hiring_manager`, `expert`.
- `/internal/recruiter` — protected recruiter area с созданием внутренних аккаунтов.
- `/internal/hiring-manager` и `/internal/expert` — role-specific placeholder areas.
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
npm run test
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
- bearer session MVP-уровня хранится в browser storage через `frontend/lib/auth.ts`

## Зависимости и образ

- зависимости управляются через `package.json` и `package-lock.json`
- Docker-образ не требует отдельной ручной установки Node tooling вне проекта
- тот же Dockerfile используется для локального baseline и CI-сборки

## Дальше

- Расширить recruiter dashboard после auth bootstrap.
- Заменить recruiter-assigned temporary password flow на invite/self-setup, когда появится email delivery.
- Реализовать candidate interview UI на browser APIs.
