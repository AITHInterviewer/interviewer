# Phase 0 Research: MVP Multi-Role Auth for Internal Access

Все пункты Technical Context в `plan.md` разрешены; этот файл фиксирует решения и их
обоснование до реализации.

## Backend: modular monolith layering

- **Decision**: backend реализуется как один FastAPI сервис с разделением на `routers/`,
  `services/`, `repositories/`, `schemas/`, `dependencies/` и `models/`.
- **Rationale**: это прямо соответствует архитектурным ограничениям фичи: роуты содержат
  только HTTP-логику, бизнес-логика вынесена в application/service слой, persistence
  изолирован репозиториями. Для нынешнего масштаба auth-фичи отдельные микросервисы были бы
  лишними, а прямой доступ к ORM из роутов нарушил бы согласованность архитектуры.
- **Alternatives considered**: толстые FastAPI роутеры с SQLAlchemy-запросами внутри —
  отклонено, так как смешивает HTTP, business rules и persistence; отдельный auth-сервис —
  отклонено как преждевременная сервисная декомпозиция.

## Backend: ORM, DB session и миграции

- **Decision**: SQLAlchemy 2.0 async + `asyncpg` + Alembic.
- **Rationale**: стек уже подготовлен в проекте и соответствует async FastAPI baseline.
  Миграции нужны сразу, потому что auth добавляет первичные доменные таблицы, от которых
  потом будут зависеть recruiter-facing сценарии.
- **Alternatives considered**: raw SQL / `asyncpg` без ORM — отклонено, так как усложняет
  тестирование и повторное использование persistence logic в repository layer.

## Backend: password hashing and token sessions

- **Decision**: пароль хранится только в виде bcrypt-хеша через `passlib[bcrypt]`; сессия
  реализуется как signed bearer token с role-aware claims и сроком жизни.
- **Rationale**: это минимальный и стандартный MVP-подход для email/password auth без
  внешнего провайдера. Он совместим с текущим spec, поддерживает несколько внутренних ролей
  и не требует дополнительной инфраструктуры вроде почтовых инвайтов уже сейчас.
- **Alternatives considered**: magic link — отклонено, так как требует email delivery и
  invite lifecycle; сторонний auth provider — отклонено как лишняя внешняя зависимость для
  локального MVP.

## Backend: role model

- **Decision**: один `InternalUser` с обязательной ролью из фиксированного набора
  `recruiter`, `hiring_manager`, `expert`; recruiter self-signup, остальные роли создаются
  только авторизованным recruiter.
- **Rationale**: единая таблица пользователей с role field проще, чем отдельные сущности по
  ролям, и лучше подходит для будущего расширения permissions без дублирования auth-модели.
- **Alternatives considered**: отдельные таблицы `Recruiter`, `HiringManager`, `Expert` —
  отклонено из-за дублирования email/password/session semantics; role-less users with future
  backfill — отклонено, так как откладывает ключевую доменную ось, которую user explicitly
  wants to lock in now.

## Backend: recruiter-scoped user visibility

- **Decision**: recruiter-created internal accounts are visible only to the recruiter who created them; the recruiter `Users` tab is scoped by `created_by_user_id` rather than showing a global list of all internal users.
- **Rationale**: this matches the intended ownership model and prevents accidental cross-recruiter visibility in the first recruiter workspace implementation.
- **Alternatives considered**: global internal-user directory for all recruiters — отклонено, так как противоречит domain rule stated by the user; separate tenant/org layer — отложено, потому что это более широкая multi-tenant модель, чем требуется в текущей фиче.

## Backend: recruiter-created accounts in MVP

- **Decision**: recruiter при создании `hiring_manager` и `expert` аккаунтов задаёт им
  временный стартовый пароль; invite-based completion flow откладывается.
- **Rationale**: это самая короткая рабочая траектория к multi-role onboarding. Она даёт
  тестируемый end-to-end поток без почтовой интеграции, invitation token storage и
  дополнительного first-login handshake.
- **Alternatives considered**: full invite flow — отклонено как следующий самостоятельный
  вертикальный срез; auto-generated password — отклонено, так как создаёт лишний UX и хуже
  контролируется recruiter-ом.

## Backend: DI and authorization boundaries

- **Decision**: FastAPI `Depends` используется для получения DB session, текущего internal
  user и role-specific access checks; сервисы получают репозитории и вспомогательные auth
  компоненты через конструктор/фабрику вызова из dependency functions.
- **Rationale**: это соответствует требованию явного dependency injection и keeps routes
  thin. Проверки роли остаются декларативными на уровне endpoint wiring, а не размазаны по
  handler bodies.
- **Alternatives considered**: глобальные singletons и прямой импорт session/service inside
  handlers — отклонено как более хрупкий и хуже тестируемый вариант.

## Frontend: session handling and protected navigation

- **Decision**: frontend использует тонкую `fetch`-обёртку и минимальный auth helper для
  хранения bearer token в клиентском storage MVP-уровня, role-aware redirect logic и guarded
  protected pages.
- **Rationale**: это наименьший рабочий путь, совместимый с существующим frontend skeleton и
  текущим контекстом проекта. Cookie-based session можно пересмотреть позже, если появятся
  SSR-heavy protected flows или усиленные security requirements.
- **Alternatives considered**: полноценный auth framework — отклонено как избыточно;
  HttpOnly cookie сразу — отложено, так как не является обязательным для MVP и увеличивает
  объём координации между frontend и backend.

## Frontend: UI composition and design system reuse

- **Decision**: auth UI строится поверх существующих semantic tokens и CSS patterns из
  `frontend/styles/tokens.css` и `frontend/styles/app.css`; формы и панели визуально
  наследуют существующие `split-form`, `form-surface`, `.button`, `.status`, `.setup-stage`
  и related patterns.
- **Rationale**: это прямое требование constitution + user constraints. Auth screens должны
  ощущаться частью уже намеченного recruiter/candidate интерфейса, а не отдельным продуктом.
- **Alternatives considered**: новый UI kit / отдельная auth theme — отклонено как нарушение
  единой визуальной системы.

## Testing strategy

- **Decision**: покрытие включает backend unit tests для services/repositories,
  integration/API tests для auth endpoints
- **Rationale**: user explicitly requested tests, а сама фича затрагивает и бизнес-правила,
  и persistence, и HTTP boundary, и frontend navigation. Одних endpoint tests недостаточно,
  потому что архитектура intentionally разделяет слои.
- **Alternatives considered**: только ручная проверка для фронтенда — приемлемо; только E2E — отклонено,
  так как слишком грубо локализует проблемы и плохо соответствует modular monolith layering.

## Long-running work policy

- **Decision**: эта auth-фича не должна вводить long-running processing в request handlers;
  если позже появятся invite emails, audit enrichment или background cleanup, они будут
  вынесены во внешнюю/background обработку.
- **Rationale**: это прямое архитектурное ограничение пользователя и хорошая граница на
  будущее расширение auth.
- **Alternatives considered**: inline delivery/cleanup inside request handlers — отклонено,
  так как нарушает stated architecture and latency expectations.
