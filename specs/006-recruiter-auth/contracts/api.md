# API Contract: MVP Multi-Role Auth for Internal Access

Формат — облегчённый OpenAPI-стиль. Все пути расположены под `/api/v1`. Public endpoints
отмечены отдельно. Protected endpoints требуют `Authorization: Bearer <token>`.

## Auth

### `POST /api/v1/auth/register` — public

Создаёт первый внутренний аккаунт через self-service registration только для recruiter.

Вход: `{name, email, password}`

Выход `201`:
`{access_token, token_type: "bearer", user: {id, name, email, role}}`

Ошибки:
- `409`: email уже занят
- `422`: невалидные входные данные

### `POST /api/v1/auth/login` — public

Вход: `{email, password}`

Выход `200`:
`{access_token, token_type: "bearer", user: {id, name, email, role}}`

Ошибки:
- `401`: неверные учётные данные
- `422`: невалидные входные данные

### `GET /api/v1/auth/me`

Возвращает текущего внутреннего пользователя и его роль по активной bearer session.

Выход `200`:
`{id, name, email, role}`

Ошибки:
- `401`: токен отсутствует, истёк или недействителен

## Internal User Management

### `POST /api/v1/internal-users`

Доступно только recruiter. Создаёт новый внутренний аккаунт роли `hiring_manager` или
`expert` с временным стартовым паролем.

Вход: `{name, email, role, temporary_password}`

Выход `201`:
`{id, name, email, role, created_by_user_id}`

Ошибки:
- `401`: пользователь не аутентифицирован
- `403`: текущий пользователь не recruiter
- `409`: email уже занят
- `422`: роль не поддерживается или входные данные невалидны

### `GET /api/v1/internal-users`

Доступно только recruiter. Возвращает только те internal accounts, которые были созданы
текущим recruiter. Глобальный список всех внутренних пользователей не отдаётся.

Выход `200`:
`{items: [{id, name, email, role, created_by_user_id}]}`

Ошибки:
- `401`: пользователь не аутентифицирован
- `403`: текущий пользователь не recruiter

### `GET /api/v1/internal-users/me/landing`

Возвращает минимальную информацию для role-specific placeholder area после входа.

Выход `200`:
`{role, title, description, available_actions: string[]}`

Ошибки:
- `401`: пользователь не аутентифицирован

## Protected Boundary Rules

- Recruiter-only actions используют bearer token и role check.
- Recruiter-only user list uses bearer token, role check, and recruiter ownership filtering.
- `hiring_manager` и `expert` могут успешно аутентифицироваться и получить свой minimal
  landing payload, но recruiter-only account creation им недоступен.
- Candidate routes under interview-token flow не используют этот auth contract и не требуют
  bearer token.
