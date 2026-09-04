# Implementation Plan: MVP Multi-Role Auth for Internal Access

**Branch**: `006-recruiter-auth` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-recruiter-auth/spec.md`

## Summary

Фича добавляет минимальную, но расширяемую внутреннюю аутентификацию для нескольких ролей:
рекрутёр сам регистрируется и входит в систему, затем создаёт аккаунты `hiring manager`
и `expert`, задавая им временные стартовые пароли. Все внутренние пользователи могут
входить в систему и попадать в защищённую role-specific placeholder-зону, а кандидатский
доступ по токенизированной ссылке остаётся отдельным и не зависит от внутренних аккаунтов.
Рекрутёр в своём workspace видит только те internal accounts, которые создал сам.

Технический подход: развить текущий пустой `backend/` до modular monolith структуры с
разделением на HTTP-роутеры, application/services слой и репозитории поверх PostgreSQL;
использовать DI через FastAPI `Depends`; хранить внутренние аккаунты, роли и сессии в БД;
добавить на `frontend/` auth-экраны и минимальные role-aware entry pages поверх уже
существующего дизайн-системного CSS (`frontend/styles/tokens.css`, `app.css`). Тесты
обязательны для backend и frontend, а любая потенциально долгая обработка
остаётся вне HTTP request handlers.

## Technical Context

**Language/Version**: Python 3.12 (backend, уже зафиксировано в `backend/pyproject.toml`); TypeScript / Node 22 (frontend, уже зафиксировано в `frontend/package.json`)

**Primary Dependencies**:
- Backend: `fastapi`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `passlib[bcrypt]`, JWT-библиотека (`python-jose[cryptography]` или эквивалент), `uvicorn[standard]`
- Frontend: `next`, `react`, `react-dom`, существующие UI-зависимости проекта; нативный `fetch` для вызова backend API; визуальная система только из `frontend/styles/tokens.css` и `frontend/styles/app.css`

**Storage**: PostgreSQL для внутренних аккаунтов, ролей и сессионных данных, включая recruiter ownership relationship для recruiter-created accounts; существующие frontend/browser storage механизмы только для минимальной MVP-сессии; кандидатский токен-доступ остаётся отдельной моделью доступа вне внутренней auth-схемы

**Testing**: Backend: `pytest`, `httpx.AsyncClient`, `anyio`, отдельные unit/integration тесты для сервисов, репозиториев и auth endpoints. Frontend: `vitest`, `@testing-library/react`, page/component tests для auth flows, redirects и role-specific placeholder areas.

**Target Platform**: Linux-контейнеры для backend/frontend сервисов + браузерный веб-клиент; внутренние интерфейсы desktop-first, кандидатский flow остаётся в том же frontend-приложении

**Project Type**: web application (`backend/` + `frontend/`) с modular monolith backend архитектурой

**Performance Goals**: auth-операции воспринимаются как мгновенные в обычном использовании; регистрация, вход, проверка сессии и создание внутренних аккаунтов должны завершаться в пределах обычного интерактивного веб-ожидания без фонового ожидания пользователя

**Constraints**: backend-роуты содержат только HTTP-логику; бизнес-логика живёт в application/service слое; доступ к БД изолирован репозиториями; DI выполняется через FastAPI `Depends`; long-running work не выполняется в request handlers; frontend обязан следовать `frontend/styles/design-system.md` и не вводить конкурирующую дизайн-систему

**Scale/Scope**: hackathon/MVP; 3 внутренние роли (`recruiter`, `hiring_manager`, `expert`); auth entry routes `/`, `/register`, `/login` и protected internal routes `/internal/*`; небольшой внутренний user base без multi-tenant изоляции на этой итерации

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-First Delivery** — PASS. `spec.md` существует и уже уточнён через `speckit-clarify`; `tasks.md` будет сгенерирован до начала реализации.
- **II. Single SDD Source Of Truth** — PASS. Работа привязана к `specs/006-recruiter-auth/` как единственному источнику истины для текущей auth-фичи.
- **III. Vertical Slices Over Horizontal Layers** — PASS. `tasks.md` будет организован по user stories: self-signup recruiter, recruiter-created accounts, multi-role sign-in, protected access. Каждая история independently testable.
- **IV. Contract-First Frontend/Backend Boundaries** — PASS. `contracts/` в этой фазе зафиксирует auth payloads, role-aware responses и protected endpoint expectations до начала реализации UI и backend handlers.
- **V. Minimalism And Verifiable Change** — PASS. Архитектурное разделение на routers/services/repositories является явным требованием этой фичи и остаётся минимальным в рамках modular monolith; verification будет зафиксирован в `quickstart.md` и будущих `tasks.md`.
- **UI Identity** — PASS. План привязан к `frontend/styles/design-system.md`, `frontend/styles/tokens.css` и `frontend/styles/app.css`; новый UI не вводит альтернативную визуальную систему.

Нарушений, требующих отдельного оправдания, на этапе планирования нет.

## Project Structure

### Documentation (this feature)

```text
specs/006-recruiter-auth/
├── plan.md              # этот файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 — auth API contract
└── tasks.md             # Phase 2 (speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── config.py                  # расширяется auth/database настройками
│   ├── main.py                    # регистрирует auth router и protected routers
│   ├── db.py                      # async engine/session factory
│   ├── dependencies/
│   │   └── auth.py                # Depends helpers for current user / role checks
│   ├── domain/
│   │   └── auth/                  # enums/value objects при необходимости
│   ├── models/
│   │   └── user.py                # internal account + role persistence model
│   ├── repositories/
│   │   └── user_repository.py     # isolated persistence access + recruiter-scoped list queries
│   ├── routers/
│   │   ├── health.py              # существует
│   │   └── auth.py                # HTTP-only auth endpoints
│   ├── schemas/
│   │   └── auth.py                # request/response schemas
│   ├── services/
│   │   ├── auth_service.py        # sign-up/sign-in/session logic
│   │   └── user_admin_service.py  # recruiter-created internal accounts
│   └── migrations/                # Alembic
└── tests/
    ├── test_auth_api.py           # endpoint/integration tests
    ├── test_auth_service.py       # business logic tests
    └── test_user_repository.py    # persistence tests

frontend/
├── app/
│   ├── page.tsx                       # internal entry point / redirect
│   ├── login/page.tsx                 # sign-in page
│   ├── register/page.tsx              # recruiter self-signup page
│   └── internal/
│       ├── page.tsx                   # generic protected landing route if needed
│       ├── recruiter/page.tsx         # recruiter workspace tabs + recruiter-scoped user list + create-account UI
│       ├── hiring-manager/page.tsx    # role placeholder area
│       └── expert/page.tsx            # role placeholder area
├── components/
│   └── auth/                          # form/panel components built from existing patterns
├── lib/
│   ├── api.ts                         # thin fetch wrapper
│   └── auth.ts                        # client-side session helpers
├── styles/
│   ├── app.css                        # source patterns reused, not replaced
│   ├── design-system.md               # visual rules
│   └── tokens.css                     # source of truth for tokens
└── app/**/*.test.tsx                  # page and flow tests
```

**Structure Decision**: Web application with existing `backend/` + `frontend/` roots. The backend remains a single deployable FastAPI app, but internally follows a modular monolith shape with HTTP routers, application services, repositories, and dependency modules. The frontend stays within the existing Next.js app and extends current styles/tokens instead of adding a new component system.

## Complexity Tracking

> Нет конституционных нарушений, требующих оправдания на этапе плана.
