# Phase 0 Research: Рекрутёр — вакансии, интервью, отчёты

Все пункты Technical Context в `plan.md` уже разрешены (нет `NEEDS CLARIFICATION`) —
этот файл фиксирует обоснование выбора, а не открытые вопросы.

## Backend: ORM и миграции

- **Decision**: SQLAlchemy 2.0 (async engine, `asyncpg` драйвер) + Alembic для миграций.
- **Rationale**: FastAPI-приложение уже async (`uvicorn[standard]`); SQLAlchemy 2.0 —
  стандартный выбор для async FastAPI, Alembic — стандартный компаньон для миграций,
  никакого нового паттерна поверх уже принятого стека (`backend/pyproject.toml`).
- **Alternatives considered**: сырой `asyncpg` без ORM — отклонено, для 5 связанных
  сущностей (`Vacancy`/`Question`/`Interview`/`Evaluation`/`RecruiterDecision`, раздел 4
  архитектурного документа) ручной SQL увеличивает объём кода без выигрыша в этом
  масштабе; Prisma/другой ORM — нет причин уходить от Python-native инструмента.

## Backend: объектное хранилище резюме

- **Decision**: `boto3`, синхронный клиент к MinIO (S3-совместимый API), вызовы через
  `starlette.concurrency.run_in_threadpool`.
- **Rationale**: см. `plan.md`, Complexity Tracking — операция низкочастотная, не в
  бюджете латентности live-контура.
- **Alternatives considered**: `aioboto3` — отклонено (см. Complexity Tracking);
  прямая загрузка с фронтенда в MinIO по presigned URL — отклонено для MVP: усложняет
  контракт (нужен отдельный эндпоинт выдачи URL + finalize-эндпоинт) ради экономии одного
  прыжка через backend, не оправдано на объёмах хакатона.

## Backend: генерация вопросов LLM

- **Decision**: прямой вызов Anthropic Messages API (`anthropic` Python SDK) с
  structured output (JSON) для получения списка вопросов + `skill_tag`/`intent`/
  `reference_answer`/`estimated_duration_sec`/`format`/`difficulty` за один вызов.
- **Rationale**: раздел 7 архитектурного документа предполагает «единый абстрактный
  интерфейс» на будущее для смены провайдера, но ни `backend/`, ни другие сервисы
  сейчас не реализуют мультипровайдерность — вводить абстракцию под гипотетическую
  будущую замену провайдера нарушало бы Principle V (Minimalism). Абстрактный интерфейс
  вводится, когда появится второй реальный провайдер, а не заранее.
- **Alternatives considered**: LangChain/аналогичный фреймворк — отклонено, один
  провайдер и один тип вызова (structured generation) не оправдывают зависимость;
  OpenAI GPT — не выбрано, `live-agent/` и `evaluation-agent/` уже завязаны на Anthropic
  (см. [[001-live-interview-contour]], [[002-batch-evaluation-contour]]) — единый
  провайдер по проекту снижает число интеграций, которые нужно поддерживать.

## Backend: извлечение текста резюме

- **Decision**: `pypdf` для PDF, `python-docx` для DOCX; выбор парсера по расширению
  файла.
- **Rationale**: раздел 8 архитектурного документа явно исключает структурный парсинг
  резюме в профиль — нужен только текст как контекст для LLM ([[001-live-interview-contour]]
  использует его как есть). Простейшие библиотеки для двух ожидаемых форматов.
- **Alternatives considered**: OCR/универсальный document-parser (напр. `unstructured`) —
  избыточно для «просто вытащить текст», добавляет тяжёлые зависимости без нужды.

## Backend: авторизация рекрутёра

- **Decision**: логин/пароль с хешированием (`passlib[bcrypt]` или аналог) + JWT-сессия
  (`python-jose` или `PyJWT`), без OAuth/SSO.
- **Rationale**: раздел 1 архитектурного документа явно фиксирует «логин/пароль (или
  magic-link), без сложной ролевой модели» — берём более простой из двух вариантов
  (magic-link требует email-интеграции, которой в MVP нет — раздел 8, «вне скоупа»).
- **Alternatives considered**: magic-link — отклонено по вышеуказанной причине (нет
  email-интеграции); готовый auth-провайдер (Auth0/Clerk) — избыточная внешняя
  зависимость для одной роли без multi-tenant модели.

## Frontend: клиент к backend API

- **Decision**: тонкая обёртка над `fetch` в `frontend/lib/api.ts`, типы генерируются/
  синхронизируются вручную с `contracts/` (без кодогенерации).
- **Rationale**: масштаб контрактов (~6 эндпоинтов) не оправдывает подключение
  OpenAPI-кодогенератора; `fetch` уже доступен в Next.js без доп. зависимостей.
- **Alternatives considered**: `openapi-typescript`/`orval` — отложено; пересмотреть,
  если число эндпоинтов вырастет на порядок или контракт станет часто меняться.
