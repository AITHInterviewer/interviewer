# Quickstart Validation: MVP Multi-Role Auth for Internal Access

Этот документ проверяет auth-фичу end-to-end после реализации. Он покрывает backend API,
frontend auth UI и role-aware protected access. Требует выполнения будущего `tasks.md`.

## Prerequisites

```bash
# инфраструктура
docker compose -f infra/docker-compose.yml up -d postgres

# backend
cd backend
uv sync --extra dev
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# frontend
cd ../frontend
npm install
npm run dev
```

Ожидается:
- backend: `http://localhost:8000`
- frontend: `http://localhost:3000`

## Automated Tests

```bash
# backend
cd backend
uv run pytest -q

# frontend
cd ../frontend
npm run test
```

**Expected**: backend и frontend auth tests проходят без падений.

## US1: Recruiter self-signup

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Recruiter One","email":"recruiter@example.com","password":"StrongPass123"}' | jq
```

**Expected**:
- `201`
- ответ содержит `access_token`
- `user.role = "recruiter"`

## US2: Recruiter creates hiring manager and expert accounts

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"recruiter@example.com","password":"StrongPass123"}' | jq -r .access_token)

curl -s -X POST http://localhost:8000/api/v1/internal-users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Manager One","email":"manager@example.com","role":"hiring_manager","temporary_password":"TempPass123"}' | jq

curl -s -X POST http://localhost:8000/api/v1/internal-users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Expert One","email":"expert@example.com","role":"expert","temporary_password":"TempPass123"}' | jq
```

**Expected**:
- оба запроса возвращают `201`
- роли сохранены корректно
- повторная попытка создать пользователя с тем же email возвращает `409`

```bash
curl -s http://localhost:8000/api/v1/internal-users \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected**:
- recruiter видит только те internal accounts, которые создал сам
- глобальный список пользователей разных recruiters не возвращается

## US3: Multi-role sign-in

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@example.com","password":"TempPass123"}' | jq

curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"expert@example.com","password":"TempPass123"}' | jq
```

**Expected**:
- оба запроса успешны
- каждый ответ содержит правильную роль пользователя

## US4: Protected access and candidate separation

```bash
MANAGER_TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@example.com","password":"TempPass123"}' | jq -r .access_token)

curl -s http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer $MANAGER_TOKEN" | jq

curl -s -X POST http://localhost:8000/api/v1/internal-users \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Blocked","email":"blocked@example.com","role":"expert","temporary_password":"TempPass123"}' | jq
```

**Expected**:
- `GET /auth/me` успешен
- `POST /internal-users` с токеном `hiring_manager` возвращает `403`
- candidate route `/interview/<token>` на frontend не требует internal login

## Frontend Manual Validation

Пройти вручную:
1. `/register` — зарегистрировать recruiter и убедиться, что происходит переход в recruiter landing area.
2. recruiter UI — создать аккаунт `hiring_manager` и `expert`.
3. убедиться, что во вкладке `Users` отображаются только пользователи, созданные текущим recruiter.
4. `/login` — войти под `hiring_manager` и увидеть его placeholder area.
5. `/login` — войти под `expert` и увидеть его placeholder area.
6. открыть protected internal route без токена — убедиться в редиректе на `/login`.
7. открыть `/interview/demo-token` без internal login — убедиться, что candidate flow не редиректит на internal auth.

**Expected**:
- все auth-формы используют существующий visual language проекта
- recruiter, hiring manager и expert получают role-aware entry screens
- unauthenticated access к internal area не проходит
- candidate flow остаётся независимым от internal auth

## Validation Notes

- 2026-09-03: automated validation passed via `uv run alembic upgrade head`, `uv run pytest -q`, `npm run test`, `npm run lint`, `npm run build`.
