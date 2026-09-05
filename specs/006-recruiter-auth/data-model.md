# Phase 1 Data Model: MVP Multi-Role Auth for Internal Access

Этот документ фиксирует минимальную доменную модель для внутренней аутентификации и
нескольких ролей. Кандидатский доступ по interview token остаётся вне этой модели и не
заменяется внутренними аккаунтами.

## InternalUser

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | UUID PK | |
| `email` | text | unique, not null |
| `name` | text | not null |
| `password_hash` | text | not null |
| `role` | enum(`recruiter`, `hiring_manager`, `expert`) | not null |
| `created_by_user_id` | UUID FK → internal_user.id | nullable; `null` только для self-registered recruiter |
| `must_rotate_password` | boolean | default `false` for self-registered recruiter; `true` for recruiter-created accounts if first-login rotation is added during implementation, otherwise optional and kept ready for future use |
| `created_at` | timestamptz | default now() |
| `last_login_at` | timestamptz | nullable |

### Invariants

- email уникален глобально для всех внутренних ролей.
- self-service registration доступен только для `role = recruiter`.
- аккаунты `hiring_manager` и `expert` создаются только уже авторизованным recruiter.
- любой внутренний аккаунт имеет ровно одну роль.
- recruiter `Users` tab lists only accounts where `created_by_user_id = current_recruiter.id`.

## AuthSessionView

Отдельная обязательная SQL-таблица не требуется для MVP bearer-token модели, но система
должна уметь представлять текущую аутентифицированную сессию как совокупность:

| Поле | Тип | Ограничения |
|---|---|---|
| `user_id` | UUID | not null |
| `role` | enum(`recruiter`, `hiring_manager`, `expert`) | not null |
| `issued_at` | timestamptz | not null |
| `expires_at` | timestamptz | not null |

Если в ходе реализации понадобится server-side revocation list или persisted refresh model,
это добавляется отдельной сущностью в новой итерации, а не подразумевается silently здесь.

## CandidateAccessBoundary

| Поле | Тип | Ограничения |
|---|---|---|
| `interview_access_token` | text | unique, not null; существует в модели interview feature |
| `is_internal_auth_required` | boolean | всегда `false` для candidate flow |

Это не новая таблица для auth-фичи, а явная граница домена: candidate token access остаётся
отдельным способом входа в систему и не должен зависеть от `InternalUser`.

## Relationships

```
InternalUser (recruiter) 1───* InternalUser (hiring_manager / expert created by that recruiter)
InternalUser 0───1 AuthSessionView (runtime representation, not persisted table in MVP)
Candidate interview token ─── separate from InternalUser auth
```

## State Transitions

- `InternalUser` lifecycle:
  - recruiter: `not_registered → active`
  - recruiter-created account: `not_created → active`
- Session lifecycle:
  - `anonymous → authenticated → expired`

Если first-login password rotation будет включена в implementation scope этой же фичи,
допустим дополнительный runtime переход `temporary_password → rotated_password`, но он пока
не обязателен спецификацией.

## Validation Rules

- `email` должен быть валиден по стандартным правилам product account email.
- `password_hash` никогда не возвращается в responses.
- `created_by_user_id IS NULL` допустим только для recruiter self-signup.
- `created_by_user_id IS NOT NULL` требует, чтобы creator user имел `role = recruiter`.
- recruiter-scoped list endpoints must filter by `created_by_user_id = actor.id` and must not expose users created by a different recruiter.
- создание внутреннего аккаунта с уже существующим email отклоняется до записи в БД.

## Scale Notes

- MVP ориентирован на малое число внутренних пользователей на инстанс.
- индекса по `email` достаточно для критического auth path на этом масштабе.
