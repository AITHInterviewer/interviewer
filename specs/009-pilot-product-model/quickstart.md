# Quickstart: 009 pilot product model

Ветка: `feat/ui-on-main` от `origin/main`. Макет `feat/frontend-ui` не мержить.

## Стенд

```bash
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
docker compose -f docker-compose.dev.yml up --build
```

Frontend: http://localhost:3000  
Backend health: http://localhost:8000/health

Не открывать `127.0.0.1` — Next не гидратируется.

## Роли

Зарегистрировать рекрутера на `/register`. Создать expert и hiring_manager в `/internal/users`.

- Рекрутер → `/vacancies`
- Эксперт → `/expert`
- Менеджер → `/manager`
- Кандидат → ссылка `/i/{token}` после активации вакансии

## Инвайт

Вакансия должна быть `active` (эксперт одобрил версию, рекрутер нажал «Активировать»). Ссылка копируется, почта не отправляется.

## Проверка

```bash
cd backend && uv run pytest
cd frontend && npm test
cd tools/live-view && node run.mjs /login /vacancies /expert /manager
```
