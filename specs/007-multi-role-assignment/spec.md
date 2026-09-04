# Feature Specification: Extensible Multi-Role Internal Users

**Feature Branch**: `[007-multi-role-assignment]`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User descriptions: (1) "хочется чтоб было возможно одному пользователю назначать несколько ролей. например рекрутер при должной компетенции мог бы быть и экспертом и сам бы редактировал вопросы"; (2) "в рамках 007-multi-role-assignment надо сделать решение расширяемым". Merged scope: multi-role assignment on one internal account (original 007) plus the declarative role registry and capability mapping that make the role model extensible (merged from 008).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Администратор ролей назначает несколько ролей одному внутреннему пользователю (Priority: P1)

Уполномоченный внутренний пользователь может назначить одному аккаунту сразу несколько внутренних ролей, чтобы не создавать дублирующие аккаунты для одного и того же человека, если он совмещает несколько функций.

**Why this priority**: без этого система вынуждает заводить отдельные аккаунты на одного человека, что ломает базовую модель доступа и мешает реальным рабочим сценариям.

**Independent Test**: взять существующий внутренний аккаунт, назначить ему вторую роль и убедиться, что аккаунт остаётся единым, а обе роли считаются активными для этого пользователя.

**Acceptance Scenarios**:

1. **Given** внутренний пользователь уже существует с одной ролью, **When** уполномоченный пользователь добавляет ему ещё одну роль, **Then** система сохраняет обе роли на одном аккаунте без создания второго аккаунта.
2. **Given** внутренний пользователь уже имеет несколько ролей, **When** уполномоченный пользователь открывает его карточку или форму редактирования, **Then** система показывает полный актуальный набор назначенных ролей.
3. **Given** роль уже назначена этому аккаунту, **When** уполномоченный пользователь пытается назначить её повторно, **Then** система не создаёт дубликат назначения и сохраняет набор ролей без повторов.
4. **Given** внутренний аккаунт имеет ровно одну роль, **When** уполномоченный пользователь пытается снять её, **Then** система отклоняет операцию, потому что аккаунт обязан сохранить хотя бы одну роль.

---

### User Story 2 - Рекрутёр совмещает роль эксперта и редактирует вопросы без смены аккаунта (Priority: P1)

Рекрутёр с достаточной компетенцией может в рамках одного аккаунта получить также роль эксперта и использовать экспертные возможности, включая редактирование вопросов, без отдельного логина и без переключения между разными учётными записями.

**Why this priority**: это основной бизнес-сценарий из запроса пользователя; без него новая ролевая модель не решает практическую задачу совмещённых обязанностей.

**Independent Test**: назначить одному аккаунту роли recruiter и expert, войти под этим аккаунтом и убедиться, что пользователь может открыть recruiter area и выполнить действия по редактированию вопросов, доступные экспертной роли.

**Acceptance Scenarios**:

1. **Given** одному аккаунту назначены роли recruiter и expert, **When** пользователь входит в систему, **Then** система распознаёт обе роли в одной сессии.
2. **Given** пользователь имеет роль recruiter и expert, **When** он открывает сценарий редактирования вопросов, **Then** система допускает его к этому действию без требования отдельного expert-аккаунта.
3. **Given** пользователь имеет роль recruiter, но не имеет capability редактирования вопросов, **When** он пытается выполнить это действие, **Then** система не предоставляет его (403).

---

### User Story 3 - Новая внутренняя роль добавляется через декларативный реестр без переписывания ролевой логики (Priority: P1)

Когда продукту нужна новая внутренняя роль (например, "методолог"), команда добавляет её определение в единый декларативный реестр ролей — с кодом, названием, доступностью для назначения, порядком сортировки и набором возможностей — и система начинает поддерживать эту роль во всех точках: назначение на аккаунт, вход, доступные области и действия. Логика входа, проверки доступа и навигации при этом не меняется.

**Why this priority**: это ядро запроса на расширяемость; без него каждая новая роль требует разбросанных правок в коде, что медленно и рискованно.

**Independent Test**: добавить в реестр новую роль с набором возможностей, назначить её существующему аккаунту, войти под этим аккаунтом и убедиться, что роль видна в сессии, а доступные области и действия соответствуют объявленным возможностям — без изменения кода входа и авторизации.

**Acceptance Scenarios**:

1. **Given** реестр ролей содержит встроенные роли, **When** в реестр добавляется новая роль с кодом, названием и набором возможностей, **Then** система позволяет назначить эту роль существующему внутреннему аккаунту без изменения кода назначения ролей.
2. **Given** аккаунту назначена новая роль из реестра, **When** пользователь входит в систему, **Then** сессия и рабочая область отражают новую роль и предоставляют объявленные ей возможности.
3. **Given** новая роль объявлена в реестре, **When** проверяется доступ к действию, привязанному к её возможности, **Then** результат определяется через объявленное отображение роль → возможности, а не через перечисление ролей в коде проверки.

---

### User Story 4 - Возможности ролей управляются отображением роль → возможности, а не разбросанными условиями (Priority: P1)

Каждая роль декларативно описывает, какие внутренние области (areas) и действия (actions) она открывает. Проверка доступа к защищённым действиям опирается на совокупность возможностей всех назначенных ролей, поэтому расширение возможностей существующей роли или добавление возможности новой роли — это изменение отображения, а не правка логики каждого защищённого сценария.

**Why this priority**: именно скрытые проверки вида "если роль == X" делают модель нерасширяемой; без устранения этих точек User Story 3 не имеет смысла.

**Independent Test**: взять сценарий экспертного редактирования вопросов, убедиться, что доступ определяется capability `questions.edit`, что recruiter+expert пропускается, а recruiter без неё отклоняется — и что выдача этой capability ещё одной роли в реестре открывает действие её пользователям без правки кода сценария.

**Acceptance Scenarios**:

1. **Given** роль expert объявляет capability редактирования вопросов, **When** пользователю с ролями recruiter и expert предъявляется это действие, **Then** система допускает его на основании совокупности возможностей его ролей.
2. **Given** пользователь имеет только роль recruiter, **When** он пытается выполнить редактирование вопросов, **Then** система не допускает действие, потому что совокупность его возможностей её не включает.
3. **Given** существующей роли добавляется новая capability в отображении, **When** пользователь с этой ролью входит в систему, **Then** ему становятся доступны новые области или действия без изменения его назначений ролей и без правки кода сценариев.

---

### User Story 5 - Существующие роли и сценарии работают без регрессий (Priority: P2)

После внедрения multi-role модели и расширяемого реестра внутренний пользователь с одной ролью продолжает видеть только разрешённые его ролью функции без изменения потока входа, а встроенные роли recruiter, hiring manager и expert воспроизводят текущее поведение ровно. Исторические назначения ролей остаются валидными без миграции аккаунтов.

**Why this priority**: изменение модели доступа не должно ломать уже работающие сценарии для существующих внутренних пользователей.

**Independent Test**: прогнать сценарии приёмки в single-role поведении (вход, навигация, редактирование вопросов экспертом, отказ не-эксперту) поверх новой модели с встроенным реестром и убедиться в совпадении поведения с текущим.

**Acceptance Scenarios**:

1. **Given** внутренний аккаунт с одной ролью существовал до изменений, **When** он входит в систему после них, **Then** его доступ и поток входа не меняются.
2. **Given** аккаунту назначены роли recruiter и expert, **When** он выполняет редактирование вопросов, **Then** результат совпадает с ожидаемым поведением expert-роли.
3. **Given** реестр ролей изменён (добавлена роль или capability), **When** существующие назначения ролей проверяются, **Then** валидные исторические назначения продолжают работать без переназначения.
4. **Given** у пользователя изменился набор ролей, **When** изменение сохранено, **Then** система применяет обновлённый доступ без необходимости создавать новый аккаунт.

---

### Edge Cases

- Пользователь пытается сохранить внутренний аккаунт без единой назначенной роли.
- Пользователю пытаются назначить роль, которой нет в реестре или которая помечена недоступной для назначения.
- У пользователя уже есть доступ к редактированию вопросов по одной роли, и ему добавляют вторую роль, которая не должна ограничить существующие разрешения.
- Пользователю снимают одну из нескольких ролей, и система должна сохранить доступы, разрешённые оставшимися ролями.
- Пользователь с несколькими ролями входит в систему после того, как часть его ролей была изменена другим уполномоченным пользователем.
- Существующие пользователи с одной ролью должны продолжить входить и работать без обязательной миграции в новый UX-сценарий.
- В реестр пытаются добавить роль с дублирующимся кодом — система отклоняет определение и не применяет его частично.
- Пытаются удалить роль из реестра или пометить её недоступной, пока она назначена хотя бы одному аккаунту — система отклоняет операцию до снятия всех её назначений.
- В отображении роль → возможности ссылается на неизвестную область или действие — система отклоняет определение с понятной ошибкой.
- Пустой набор возможностей у роли — роль существует, но не открывает ни одной области или действия.
- Код роли в данных назначений не совпадает ни с одной записью реестра (повреждённые или устаревшие данные) — система обрабатывает это предсказуемо, не отдавая лишних прав.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow one internal user account to hold more than one internal role at the same time.
- **FR-002**: System MUST treat multiple roles as assignments on a single internal account rather than requiring separate accounts per role.
- **FR-003**: System MUST allow an authorized internal user to view the full set of roles currently assigned to an internal account.
- **FR-004**: System MUST allow an authorized internal user to add an additional supported role to an existing internal account.
- **FR-005**: System MUST allow an authorized internal user to remove a role from an internal account as long as the account retains at least one internal role.
- **FR-006**: System MUST prevent duplicate assignment of the same role to the same internal account.
- **FR-007**: System MUST continue to support internal accounts that have only one role without changing their core sign-in flow.
- **FR-008**: System MUST recognize the complete set of a user's assigned roles when establishing or validating an internal session.
- **FR-009**: System MUST determine access to protected internal actions based on the user's full assigned role set rather than a single primary role only.
- **FR-010**: System MUST allow a user who holds both recruiter and expert roles to access expert-level question editing within the same signed-in account.
- **FR-011**: System MUST not allow a user to perform question-editing actions unless the user's assigned roles include the required editing capability.
- **FR-012**: System MUST preserve a single internal identity for audit, ownership, and history even when that user gains or loses additional roles.
- **FR-013**: System MUST ensure role changes on an internal account are reflected in subsequent access checks.
- **FR-014**: System MUST support at least these internal roles: recruiter, hiring manager, and expert.
- **FR-015**: System MUST keep existing internal user scenarios functional for users who never receive more than one role.
- **FR-016**: System MUST maintain a single declarative registry of supported internal roles; adding a new supported role MUST be an addition to this registry, not a change to sign-in, assignment, authorization, or navigation logic.
- **FR-017**: Each role definition in the registry MUST include at least: a unique stable code, a human-readable title, an assignable flag, a presentation ordering hint, and a set of mapped capabilities (internal areas and actions).
- **FR-018**: System MUST gate protected internal actions by capability derived from the role registry, using the union of capabilities across the user's assigned roles, instead of hardcoded role-code comparisons in each protected scenario.
- **FR-019**: System MUST allow an authorized user to assign any role that exists in the registry and is marked assignable, without code changes when new assignable roles appear.
- **FR-020**: System MUST derive post-sign-in navigation, landing behavior, and available areas from the combined capabilities of the user's assigned roles as described in the registry, not from a per-role hardcoded layout.
- **FR-021**: System MUST validate registry definitions at application startup: unique role codes, referenced areas and actions must be known, built-in roles (recruiter, hiring_manager, expert) must exist; malformed definitions MUST be rejected with a clear error and never partially applied.
- **FR-022**: System MUST reject assignment of role codes that are not present in the registry or are not assignable.
- **FR-023**: System MUST NOT reduce the access granted by one role when additional roles are assigned; effective access is the union of capabilities.
- **FR-024**: Removing or deactivating a role in the registry MUST be rejected while that role is still assigned to at least one internal account; the operation succeeds only after all assignments of that role are removed.
- **FR-025**: The registry and capability mapping MUST be maintainable as declarative configuration or seed data edited by the development team; no runtime product UI for role management is required in this scope.

### Key Entities *(include if feature involves data)*

- **Internal Account**: A single internal user identity with personal details, sign-in credentials, and one or more assigned internal roles.
- **Role Assignment**: A relationship between an internal account and one registry role code, recorded without duplicating the user identity; unique per account+role pair.
- **Role Registry Entry**: Declarative definition of one supported internal role: stable code, title, assignable flag, ordering hint, and mapped capabilities. The only artifact that changes when a new role is introduced.
- **Capability**: A named internal area or action (e.g. question editing) that role definitions grant and protected scenarios require; roles grant capabilities, access checks test capabilities.
- **Role-to-Capability Mapping**: The declarative attachment of capabilities to a role registry entry; the single place that defines what a role unlocks.
- **Effective Access Set**: The computed union of capabilities of a signed-in account's currently assigned roles; the single input to every access decision.
- **Landing Profile**: The internal areas and actions available to the signed-in user after combining all assigned roles per the registry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In validation runs, 100% of tested internal accounts can be assigned two supported roles without creating duplicate user records.
- **SC-002**: A qualified recruiter can gain expert access on the same account and reach question-editing capability in under 2 minutes after role assignment.
- **SC-003**: In validation runs, 100% of users with both recruiter and expert roles can complete the sign-in flow once and access both role-dependent areas within the same session.
- **SC-004**: In validation runs, 100% of users lacking the question-editing capability are prevented from using question-editing actions.
- **SC-005**: Existing single-role users continue to complete their sign-in and primary internal workflow without additional required account setup in 100% of validation runs.
- **SC-006**: A team member can add a fully functional new internal role — assignable, sign-in visible, with declared areas and actions — by changing only the role registry and capability mapping, in under 1 hour, verified in 100% of validation runs without touching sign-in, assignment, or authorization code.
- **SC-007**: In a code review of protected internal scenarios, 0 hardcoded role-code comparisons remain for access decisions; 100% of access decisions resolve through the role-to-capability mapping.
- **SC-008**: Malformed registry definitions (duplicate codes, unknown capabilities) are rejected with a clear error in 100% of validation runs and never partially applied.
- **SC-009**: Granting an additional capability to an existing role through the mapping takes effect for all users with that role at their next sign-in or session refresh, without any change to user accounts or role assignments, in 100% of validation runs.

## Assumptions

- This feature replaces the current single-role account model with a unified, extensible multi-role model in one delivery; there is no intermediate "multi-role with hardcoded checks" state.
- The same person is represented by one internal account even when they perform multiple business functions.
- Existing single-role accounts migrate by converting their current role value into one role assignment; no account recreation is needed.
- Recruiter, hiring manager, and expert are the built-in roles and must keep their current behavior.
- Question editing is treated as an expert-level capability for this iteration because the user explicitly cited that scenario.
- The authority to assign or remove roles follows the product's existing internal administration flow; this feature does not introduce a separate governance model.
- When a user has multiple roles, the product grants the union of capabilities from those roles; no deny-rules or role conflicts are introduced.
- The role registry is declarative configuration or seed data maintained by the development team; a runtime role-management UI is out of scope.
- A finer-grained permission engine (beyond areas + actions capabilities) is out of scope.
