# Feature Specification: MVP Multi-Role Auth for Internal Access

**Feature Branch**: `006-recruiter-auth`

**Created**: 2026-09-03

**Status**: Implemented (superseded by `specs/007-multi-role-assignment` — see note below)

**Input**: User description: "Update the current feature specification. еще необходимо добавить разные роли. потому что в идеале надо сделать следующее. сначала рекрутером создается аккаунт, он в него входит. потом рекрутер может еще создать аккаунты для: нанимающего менеджера и для эксперта(экспертом будет человек который будет валидировать вакансии и прояснять технические вопросы(прояснять тех вопросы и тд будет потом,)). сейчас важно заложить этот функционал чтобы в системе было сразу несколько ролей, они потом будут нужны для всего этого"

## Синхронизация с кодом

`backend/` больше не является только health-check scaffold: реализованы `InternalUser`,
async DB/session слой, репозиторий, auth/user-admin сервисы и роуты `/api/v1/auth/register`,
`/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/internal-users`,
`/api/v1/internal-users/me/landing`. Список `/api/v1/internal-users` теперь фильтруется по
авторизованному recruiter и не отдаёт пользователей, созданных другим recruiter.

`frontend/` теперь реализует `/register`, `/login`, `/internal`, `/internal/recruiter`,
`/internal/hiring-manager`, `/internal/expert`, local-storage session helpers, protected
role-aware redirects и recruiter tabbed workspace. Во вкладке `Users` recruiter видит только
созданные им internal accounts. Candidate route `/interview/[token]` сохранён отдельно и не
зависит от внутренней auth-сессии.

> **Superseded (2026-09-04)**: ролевая модель этой спеки заменена фичей
> `specs/007-multi-role-assignment` (extensible multi-role model). Актуальное состояние:
> колонка `internal_users.role` удалена в пользу таблицы `internal_role_assignments`,
> проверки доступа идут через capability-реестр (`backend/app/roles/`), landing и
> навигация выводятся из реестра, добавлен endpoint `GET /api/v1/internal/roles`.
> Эта спека сохраняется как описание исходного single-role поведения и истории изменений.


## Clarifications

### Session 2026-09-03

- Q: How should a recruiter-created hiring manager or expert account get its first password? → A: Recruiter sets a temporary password for that user in MVP; invite-based self-setup is deferred.
- Q: Should hiring manager and expert be able to sign in and see a basic placeholder internal area in MVP, or should their accounts exist now only for future use? → A: Hiring manager and expert can sign in now and see a basic role-specific internal area.
- Q: Should the new tab layout be implemented only inside the recruiter workspace, with one working Users tab now and Vacancies and Candidates shown as disabled or placeholder tabs for later? → A: Tabs are implemented only in the recruiter workspace for now; `Users` works, while `Vacancies` and `Candidates` are visible placeholders.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Рекрутёр создаёт первый аккаунт и входит в систему (Priority: P1)

Новый рекрутёр открывает продукт, регистрируется по email, имени и паролю и сразу получает доступ к закрытой части продукта без ручного создания аккаунта разработчиком или администратором.

**Why this priority**: без самостоятельной регистрации невозможно начать recruiter flow в MVP и проверить остальные recruiter-facing сценарии end-to-end.

**Independent Test**: открыть страницу регистрации, создать новый аккаунт с валидными данными и убедиться, что рекрутёр попадает в закрытую внутреннюю часть продукта.

**Acceptance Scenarios**:

1. **Given** у рекрутёра ещё нет аккаунта, **When** он отправляет валидные регистрационные данные, **Then** система создаёт новый аккаунт и авторизует рекрутёра в той же сессии.
2. **Given** email уже занят, **When** рекрутёр пытается зарегистрироваться повторно, **Then** система отклоняет регистрацию и ясно сообщает, что нужно войти в существующий аккаунт.
3. **Given** рекрутёр не завершил регистрацию, **When** он открывает закрытую внутреннюю страницу продукта, **Then** система перенаправляет его на экран входа или регистрации.

---

### User Story 2 - Рекрутёр создаёт аккаунты для других внутренних ролей (Priority: P1)

Авторизованный рекрутёр может создать дополнительные внутренние аккаунты для hiring manager и expert, задавая для них временный стартовый пароль, чтобы система сразу поддерживала несколько ролей и дальнейшие процессы не упирались в однотипный доступ для всех.

**Why this priority**: будущие recruiter, hiring manager и expert сценарии зависят от того, что роли существуют в системе уже сейчас, а не добавляются задним числом после появления остальной функциональности.

**Independent Test**: войти как рекрутёр, создать по одному аккаунту для hiring manager и expert, затем убедиться, что оба аккаунта существуют как отдельные внутренние пользователи с назначенной ролью.

**Acceptance Scenarios**:

1. **Given** рекрутёр авторизован, **When** он создаёт внутренний аккаунт, выбирает роль hiring manager и задаёт временный пароль, **Then** система создаёт нового пользователя именно с этой ролью.
2. **Given** рекрутёр авторизован, **When** он создаёт внутренний аккаунт, выбирает роль expert и задаёт временный пароль, **Then** система создаёт нового пользователя именно с этой ролью.
3. **Given** рекрутёр пытается создать внутренний аккаунт с уже занятым email, **When** он отправляет форму, **Then** система отклоняет создание и сообщает о конфликте без создания дубликата.

---

### User Story 3 - Внутренний пользователь входит в существующий аккаунт по своей роли (Priority: P1)

Рекрутёр, hiring manager и expert могут входить в свои существующие аккаунты и получать доступ к базовой закрытой внутренней части продукта, предусмотренной для их роли, без повторной регистрации.

**Why this priority**: после появления нескольких ролей нужен единый способ входа для каждого внутреннего пользователя, иначе созданные аккаунты не дают практической ценности.

**Independent Test**: создать внутренние аккаунты разных ролей, войти под каждым из них и убедиться, что система распознаёт роль пользователя и открывает базовую внутреннюю зону, соответствующую его роли.

**Acceptance Scenarios**:

1. **Given** внутренний аккаунт существует, **When** пользователь вводит корректные данные входа, **Then** система успешно авторизует его, распознаёт назначенную ему роль и открывает базовую внутреннюю зону для этой роли.
2. **Given** пользователь вводит неверный пароль, **When** он отправляет форму входа, **Then** система не даёт доступ и показывает понятную ошибку без раскрытия лишних деталей.
3. **Given** пользователь уже авторизован, **When** он возвращается на страницу входа или регистрации, **Then** система направляет его в закрытую внутреннюю часть продукта.

---

### User Story 4 - Приватные внутренние функции защищены, а кандидатский доступ остаётся отдельным (Priority: P1)

Только авторизованные внутренние пользователи могут открывать закрытые внутренние страницы и использовать защищённые функции, а кандидатский сценарий продолжает работать отдельно через ссылку с уникальным токеном без аккаунта.

**Why this priority**: без разграничения доступа продукт не может безопасно хранить внутренние данные и одновременно поддерживать отдельный candidate flow без регистрации.

**Independent Test**: попытаться открыть закрытые внутренние страницы без авторизации, затем убедиться, что доступ закрыт, а candidate link по токену по-прежнему открывается без аккаунта.

**Acceptance Scenarios**:

1. **Given** пользователь не авторизован как внутренний пользователь, **When** он обращается к закрытой внутренней функции, **Then** система не предоставляет доступ и требует войти.
2. **Given** пользователь авторизован как внутренний пользователь, **When** он обращается к закрытой внутренней функции, **Then** система распознаёт его как владельца активной сессии и разрешает доступ в пределах его роли.
3. **Given** кандидат открывает персональную ссылку интервью, **When** у него нет внутреннего аккаунта, **Then** система допускает его в candidate flow без требования регистрации или входа.

---

### User Story 5 - Рекрутёр видит организованные вкладки в своей рабочей зоне (Priority: P2)

После входа рекрутёр попадает не на перегруженный экран, а в организованную рабочую зону со вкладками. В MVP рабочей является вкладка `Users`, где показывается список внутренних пользователей, созданных текущим авторизованным recruiter, и кнопка добавления нового аккаунта. Вкладки `Vacancies` и `Candidates` видны заранее как части будущей структуры, но пока работают как placeholder-состояния.

**Why this priority**: вкладки не блокируют саму аутентификацию, но они задают правильную информационную архитектуру recruiter workspace и предотвращают деградацию UX по мере появления новых recruiter-функций.

**Independent Test**: войти как рекрутёр, открыть recruiter workspace и убедиться, что вкладка `Users` активна, показывает только пользователей, созданных этим recruiter, и позволяет создавать аккаунты, а `Vacancies` и `Candidates` видимы, но явно помечены как недоступные или placeholder.

**Acceptance Scenarios**:

1. **Given** рекрутёр успешно вошёл в систему, **When** он открывает свою рабочую зону, **Then** он видит вкладки `Users`, `Vacancies` и `Candidates` в одном согласованном navigation layout.
2. **Given** рекрутёр находится в своей рабочей зоне, **When** вкладка `Users` активна, **Then** на экране отображаются только внутренние пользователи, созданные этим recruiter, и действие для создания нового аккаунта.
3. **Given** рекрутёр переключается на `Vacancies` или `Candidates`, **When** эти вкладки ещё не реализованы полностью, **Then** система показывает явное placeholder-состояние и не ломает остальную рабочую зону.

### Edge Cases

- Рекрутёр пытается зарегистрироваться с email, уже привязанным к существующему внутреннему аккаунту.
- Рекрутёр пытается создать аккаунт hiring manager или expert с email, уже занятым другой ролью.
- Рекрутёр создаёт внутренний аккаунт, но не передаёт временному пользователю его стартовый пароль.
- Внутренний пользователь вводит неполные или невалидные данные в форме регистрации или входа.
- Пользователь открывает закрытую внутреннюю страницу с истёкшей или недействительной сессией.
- Пользователь вручную открывает страницы входа и регистрации, уже имея активную внутреннюю сессию.
- Внутренний пользователь успешно входит, но для его роли пока доступна только базовая placeholder-зона без полного бизнес-функционала.
- Рекрутёр открывает placeholder-вкладку и должен явно понимать, что раздел ещё не реализован, а не видеть пустой или сломанный экран.
- Кандидат открывает ссылку интервью без внутренней сессии и не должен быть перенаправлен на логин внутреннего пользователя.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a recruiter to create the first internal account using name, email address, and password.
- **FR-002**: System MUST assign the recruiter role to accounts created through self-service registration.
- **FR-003**: System MUST prevent creation of more than one internal account with the same email address, regardless of role.
- **FR-004**: System MUST allow an existing internal user to sign in using the same email address and password used during account creation.
- **FR-005**: System MUST store internal user credentials in a form that does not expose the original password.
- **FR-006**: System MUST create an authenticated internal session after successful registration and after successful sign-in.
- **FR-007**: System MUST allow an authenticated recruiter to create additional internal accounts.
- **FR-008**: System MUST allow a recruiter to assign either the hiring manager role or the expert role when creating an additional internal account.
- **FR-009**: System MUST require the recruiter to set a temporary starting password when creating an additional internal account in MVP.
- **FR-010**: System MUST record each internal account with exactly one role at creation time.
- **FR-011**: System MUST deny access to protected internal product areas when no valid internal session is present.
- **FR-012**: System MUST redirect unauthenticated users who try to open protected internal pages to an authentication entry point.
- **FR-013**: System MUST provide a way for the product to determine whether the current visitor is an authenticated internal user and which role is assigned to that user.
- **FR-014**: System MUST preserve candidate access by unique interview link without requiring internal account creation or internal sign-in.
- **FR-015**: System MUST show clear failure feedback for invalid sign-in attempts, duplicate-registration attempts, and duplicate internal-account creation attempts.
- **FR-016**: System MUST support at least these internal roles in MVP: recruiter, hiring manager, and expert.
- **FR-017**: System MUST provide a basic post-sign-in internal area for each supported internal role in MVP, even if full role-specific workflows are not yet implemented.
- **FR-018**: System MUST keep the internal account model compatible with future role-specific workflows without changing the candidate access model.
- **FR-019**: System MUST organize the recruiter post-sign-in workspace with tabs rather than a single undifferentiated screen.
- **FR-020**: System MUST provide a working `Users` tab for recruiters that shows existing internal users and exposes the action to create a new internal account.
- **FR-021**: System MUST show `Vacancies` and `Candidates` as visible placeholder tabs in the recruiter workspace, without implying that those flows are already fully implemented.
- **FR-022**: System MUST relate each recruiter-created internal account to the recruiter who created it.
- **FR-023**: System MUST show each recruiter only the internal users created by that recruiter inside the recruiter `Users` tab.

### Key Entities *(include if feature involves data)*

- **Internal Account**: User identity for a person working inside the product, including unique email, display name, protected credential record, assigned role, creator relationship when applicable, and account creation metadata.
- **Recruiter Ownership**: Relationship that ties a recruiter-created internal account to exactly one recruiter and defines which recruiter can see that account in the `Users` tab.
- **Temporary Starting Password**: Initial secret set by a recruiter for a newly created internal account and used by that user for the first sign-in in MVP.
- **Internal Role**: Access classification attached to an internal account that identifies whether the user acts as recruiter, hiring manager, or expert.
- **Authenticated Session**: Proof that an internal user has successfully signed in and can access protected internal functionality until the session is no longer valid.
- **Candidate Interview Link**: Unique access path that identifies a candidate interview session and remains separate from internal account authentication.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new recruiter can complete registration and reach the protected internal area in under 2 minutes without developer intervention.
- **SC-002**: An authenticated recruiter can create new internal accounts for both hiring manager and expert in one validation run without direct database access or developer help.
- **SC-003**: An existing internal user can sign in and reach the protected internal area for the assigned role in under 1 minute using previously created credentials.
- **SC-004**: In validation runs, 100% of unauthenticated attempts to open protected internal pages are redirected to the authentication entry point.
- **SC-005**: In validation runs, 100% of candidate interview links remain accessible without internal account authentication.
- **SC-006**: In validation runs, 100% of recruiter sign-ins land on a tabbed recruiter workspace where `Users` is usable and `Vacancies` and `Candidates` are visible as placeholders.
- **SC-007**: In validation runs, 100% of recruiter `Users` tab results are limited to users created by the signed-in recruiter.

## Assumptions

- Candidate-facing access by interview link remains unchanged and outside the internal account model.
- Self-service registration is required only for the recruiter role; hiring manager and expert accounts are created by an authenticated recruiter.
- Recruiter-created internal accounts use recruiter-assigned temporary passwords in MVP; invite-based self-setup may be added later without changing the role model.
- Password-based access is the only required sign-in method in this iteration; password recovery, social sign-in, and email-based magic links are out of scope.
- The MVP needs the role structure and account-creation paths now, even if expert and hiring manager workflows beyond authentication will be implemented later.
- Для hiring manager и expert MVP-опыт после входа может ограничиваться минимальной placeholder-зоной, если распознавание роли и защищённый доступ работают end-to-end.
- Tabbed navigation is required only for the recruiter workspace in this iteration; hiring manager and expert areas may remain single-purpose placeholder screens.
- A recruiter sees only recruiter-created accounts that belong to that recruiter; global cross-recruiter user visibility is out of scope for this iteration.
