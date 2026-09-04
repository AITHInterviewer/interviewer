---
description: "Task list for 006-prototype-ux-pass"
---

# Tasks: Полировка демо-UI по правилам Нильсена

**Input**: Design documents from `/specs/006-prototype-ux-pass/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: не входят (в spec не запрошены). Проверка: `npm run lint`, `npm run build`, ручной [quickstart.md](./quickstart.md).

**Organization**: задачи по пользовательским историям. Новых npm-пакетов нет.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимости от незакрытой задачи)
- **[Story]**: US1…US5 только в фазах историй
- В описании есть путь к файлу

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Типы и сиды демо-ролей, без смены стека

- [x] T001 Добавить типы `DemoRole`, `RoleOnboarding`, `PipelineCard`, `PipelineStage` в `frontend/lib/demo/types.ts`
- [x] T002 Создать сид шести ролей и тексты попапа в `frontend/lib/demo/roles.ts` по `specs/006-prototype-ux-pass/contracts/demo-roles.md`
- [x] T003 [P] Добавить чтение/запись выбранной демо-роли в `frontend/lib/demo/session.ts` (sessionStorage; закрытие попапа роль не пишет)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Общая шкала и chrome, без которых истории разъедутся

**⚠️ CRITICAL**: истории не начинать, пока фаза не закрыта

- [x] T004 Добавить CSS-переменные шкалы `--text-path`, `--text-meta`, `--text-body`, `--text-h2`, `--text-h1`, `--text-display` в `frontend/app/globals.css` (цвета и радиусы не менять)
- [x] T005 Перевести `.page-title h1`, секции и кандидатские h1 на эти переменные в `frontend/app/product.css`; добавить классы empty/loading/error
- [x] T006 Вынести повторяющийся заголовок страницы в `frontend/components/chrome/PageHeader.tsx` (path + h1 + description)
- [x] T007 [P] Собрать состояния экрана `loading` / `empty` / `error` в `frontend/components/chrome/ScreenState.tsx`
- [x] T008 Добавить команду «К выбору роли» в топбар `frontend/components/chrome/AppShell.tsx` (ссылка на `/login`)
- [x] T009 [P] Добавить ту же команду в подвал `frontend/components/chrome/CandidateShell.tsx`

**Checkpoint**: токены шкалы на месте, шеллы умеют вернуться ко входу, есть PageHeader и ScreenState

---

## Phase 3: User Story 1 - Вход и короткий онбординг роли (Priority: P1) 🎯 MVP

**Goal**: Карточки с именами, попап «кто вы / что увидите / первое действие», переход на home роли, выход без записи роли

**Independent Test**: чистый заход на `/login` → каждая из шести ролей открывает попап → Continue ведёт на нужный home; Esc/«Назад к ролям» оставляет на входе; с вакансий работает «К выбору роли»

### Implementation for User Story 1

- [x] T010 [US1] Собрать экран карточек ролей (имя + фраза «что увидите», без «кандидат №1») в `frontend/app/login/page.tsx`
- [x] T011 [US1] Подключить существующий `Modal` онбординга в `frontend/app/login/page.tsx`: тексты из `roles.ts`, Continue пишет роль и `router.push(homePath)`, закрытие/Назад роль не пишет
- [x] T012 [US1] Стили карточек входа без инлайн-размеров в `frontend/app/product.css` (классы `.login-grid` / карточки)

**Checkpoint**: US1 проходит independently. Канбан ещё может быть пустым в четырёх колонках

---

## Phase 4: User Story 2 - Канбан с карточками во всех стадиях (Priority: P1)

**Goal**: Пять колонок с именными карточками; канон в «Отчёт готов»; список с подписью стадии; счётчик вакансии словами

**Independent Test**: рекрутер → Middle+ Python → ни одна колонка не «Пока пусто»; Лидия/Дмитрий/Никита открывают отчёт; Марина/Павел/Елена/Олег отчёт не открывают; «Список» показывает тех же людей со стадией

### Implementation for User Story 2

- [x] T013 [US2] Сид воронки (Марина invited, Павел inProgress, Елена processing, Олег decided + канон reportReady) в `frontend/lib/demo/pipeline.ts` и экспорт из `frontend/lib/demo/candidates.ts` или `vacancies.ts` по месту потребления
- [x] T014 [US2] Рендер пяти колонок и кликов по правилам контракта в `frontend/app/vacancies/[id]/page.tsx` (доска)
- [x] T015 [US2] Вид «Список»: те же карточки, стадия словами, без битой ссылки на отчёт, в `frontend/app/vacancies/[id]/page.tsx`
- [x] T016 [US2] Расшифровать счётчик стадий словами (не `2/1/3/0`) в `frontend/app/vacancies/page.tsx`

**Checkpoint**: воронка читается. Попап входа уже работает, если закрыт US1

---

## Phase 5: User Story 3 - Рабочие экраны по Нильсену (Priority: P1)

**Goal**: Нет пустого кадра, нет мёртвых кнопок, есть Назад/Отмена, человеческие тексты, empty вкладок честный, confirm через Modal

**Independent Test**: путь Лидии C1→C9 без белого экрана; новая вакансия с отменой; отчёт: Modal вместо confirm, доп. ответ нельзя отправить пустым; вкладки черновиков объясняют демо

### Implementation for User Story 3

- [x] T017 [US3] Убрать `return null` и мёртвую «Напомнить позже» на C1 в `frontend/app/i/[token]/page.tsx` (скелетон через ScreenState)
- [x] T018 [P] [US3] Убрать пустой кадр на C9 в `frontend/app/i/[token]/done/page.tsx`
- [x] T019 [P] [US3] Убрать пустой кадр на C8 в `frontend/app/i/[token]/resume/page.tsx`
- [x] T020 [US3] Назад/Отмена на шагах новой вакансии в `frontend/app/vacancies/new/page.tsx`
- [x] T021 [US3] Честный empty вкладок «Черновики / На проверке / Архив» в `frontend/app/vacancies/page.tsx`
- [x] T022 [US3] Подпись, почему «Пригласить» выключена, в `frontend/app/vacancies/[id]/page.tsx`
- [x] T023 [US3] `confirm` «Не продвигать» заменить на `Modal`; запрет пустого доп. ответа; убрать инлайн-стили текста в `frontend/app/vacancies/[id]/candidates/[cid]/page.tsx`
- [x] T024 [P] [US3] Заголовок AiNote с токена, не инлайн `fontSize`, в `frontend/components/evidence/AiNote.tsx`
- [x] T025 [P] [US3] Топбар AppShell без инлайн-типографики в `frontend/components/chrome/AppShell.tsx`
- [x] T026 [US3] VersionTag и жаргон ATS/Huntflow во второстепенное место с пометкой демо на отчёте и доске: `frontend/components/chrome/VersionTag.tsx` и места вызова в `frontend/app/vacancies/[id]/page.tsx`
- [x] T027 [P] [US3] Несуществующий токен/вакансия через ScreenState error, не пусто, в `frontend/app/i/[token]/page.tsx` и `frontend/app/vacancies/[id]/page.tsx`
- [x] T028 [P] [US3] Служебные 403/404/expired оставить человеческий тон, подключить PageHeader в `frontend/app/403/page.tsx`, `frontend/app/404/page.tsx`, `frontend/app/i/expired/page.tsx`

**Checkpoint**: основной демо-путь жюри без пустых кадров и без мёртвых кликов

---

## Phase 6: User Story 4 - Пилот-макеты того же качества (Priority: P2)

**Goal**: Каждый пилот-маршрут читается, помечен «Пилот», без пустого кадра и без мёртвых кнопок; C12 с названиями требований

**Independent Test**: открыть список маршрутов из Independent Test spec US4; на каждом бейдж, заголовок, выход, следующее действие или «в пилоте это макет»

### Implementation for User Story 4

- [x] T029 [US4] PageHeader + PilotBadge + нет мёртвых кнопок в `frontend/app/vacancies/[id]/settings/page.tsx`
- [x] T030 [P] [US4] То же в `frontend/app/vacancies/[id]/approve/page.tsx`
- [x] T031 [P] [US4] То же в `frontend/app/expert/page.tsx`
- [x] T032 [P] [US4] То же в `frontend/app/audit/[vacancyId]/page.tsx`
- [x] T033 [P] [US4] То же в `frontend/app/brief/[id]/page.tsx`
- [x] T034 [US4] То же в `frontend/app/brief/[id]/confirm/page.tsx`
- [x] T035 [P] [US4] То же в `frontend/app/i/[token]/extra/[id]/page.tsx`
- [x] T036 [US4] Названия требований вместо `requirementId` и ScreenState вместо `null` в `frontend/app/i/[token]/result/page.tsx`
- [x] T037 [P] [US4] Заглушка транскрипта с путём назад в `frontend/app/i/[token]/transcript/page.tsx`
- [x] T038 [P] [US4] То же качество в `frontend/app/i/[token]/request/page.tsx`
- [x] T039 [P] [US4] Список менеджера M3: PageHeader, PilotBadge, не пустой кадр, в `frontend/app/manager/page.tsx`

**Checkpoint**: любой пилот-URL не выглядит сломанным

---

## Phase 7: User Story 5 - Помощь в точке затруднения (Priority: P2)

**Goal**: На входе, доске и отчёте видно «что делать дальше» без ухода со страницы

**Independent Test**: `/login` (фраза на карточке), доска (понятно куда смотреть), отчёт Лидии (смысл «недостаточно данных» + логичное действие). Help кандидата на месте

### Implementation for User Story 5

- [x] T040 [US5] Короткая подсказка у статуса «недостаточно данных» (смысл + доп. ответ или решение человека) в `frontend/app/vacancies/[id]/candidates/[cid]/page.tsx`
- [x] T041 [US5] Одна строка ориентира на доске («в этом демо смотрите колонку Отчёт готов») в `frontend/app/vacancies/[id]/page.tsx`
- [x] T042 [P] [US5] Проверить, что help-строка кандидата на месте в `frontend/components/chrome/CandidateShell.tsx` (не удалять)

**Checkpoint**: жюри не ищет инструкцию вне экрана

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Единообразие шкалы на оставшихся экранах и проверка quickstart

- [x] T043 Подключить `PageHeader` на оставшихся внутренних MVP-страницах: `frontend/app/vacancies/[id]/rubric/page.tsx`, `frontend/app/vacancies/[id]/questions/page.tsx`, `frontend/app/manager/[cid]/page.tsx`
- [x] T044 [P] Убрать оставшиеся инлайн `fontSize`/`color` с экранов входа и шеллов, которые трогали в 006, в пользу классов `frontend/app/product.css`
- [x] T045 Прогнать `npm run lint` и `npm run build` в `frontend/`
- [x] T046 Пройти сценарии `specs/006-prototype-ux-pass/quickstart.md` вручную (вход, канбан, Лидия, пилот result, смена роли)
- [x] T047 После правок кода выполнить `graphify update .` в корне репозитория, если `graphify-out/` используется — пропущено: graphify-out нет

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: сразу
- **Foundational (Phase 2)**: после Setup; блокирует все US
- **US1, US2, US3**: после Phase 2; US1 и US2 можно параллельно разными людьми; US3 трогает часть тех же файлов, что US2 (`vacancies/[id]/page.tsx`, `vacancies/page.tsx`) — лучше после US2 или одним исполнителем
- **US4**: после Phase 2; не зависит от канбана; «К выбору роли» уже из T008/T009
- **US5**: после US1 (карточки входа) и US3 (отчёт), иначе конфликт в `candidates/[cid]/page.tsx`
- **Polish**: после нужных историй; для демо-дня минимум US1+US2+US3+T045

### User Story Dependencies

- **US1 (P1)**: после Phase 2
- **US2 (P1)**: после Phase 2; файл доски пересекается с T022/T026/T041
- **US3 (P1)**: после Phase 2; C1 пересекается с T027
- **US4 (P2)**: после Phase 2
- **US5 (P2)**: после US1 и T023

### Within Each User Story

- Сиды и типы до UI
- Один файл не размечать [P] дважды в одной фазе
- История закрыта на своём Independent Test до следующей, если один исполнитель

### Parallel Opportunities

- T002 и T003 после T001
- T006, T007, T008, T009 после T005 (T006 зависит от классов T005)
- T018, T019, T024, T025, T028 параллельно внутри US3 (разные файлы)
- T030–T033, T035, T037–T039 параллельно внутри US4
- US1 и US4 параллельно, если US2/US3 на другом человеке

---

## Parallel Example: User Story 1

```text
После T001:
Task: T002 frontend/lib/demo/roles.ts
Task: T003 frontend/lib/demo/session.ts

После Phase 2:
Task: T010 login cards в frontend/app/login/page.tsx
затем T011 Modal в том же файле (не параллельно)
Task: T012 стили в frontend/app/product.css можно с T010, если не конфликтует с T005
```

## Parallel Example: User Story 4

```text
Task: T029 settings/page.tsx
Task: T030 approve/page.tsx
Task: T031 expert/page.tsx
Task: T032 audit/[vacancyId]/page.tsx
Task: T033 brief/[id]/page.tsx
Task: T035 extra/[id]/page.tsx
Task: T037 transcript/page.tsx
Task: T038 request/page.tsx
Task: T039 manager/page.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2
2. Phase 3 US1
3. **STOP**: проверить попап всех ролей и «К выбору роли»
4. Для живого канбана сразу закрыть US2 (тоже P1)

### Incremental Delivery

1. Setup + Foundational
2. US1 вход → демо уже объясняется
3. US2 канбан → доска не выглядит сломанной
4. US3 Нильсен на пути жюри → можно показывать кейс
5. US4 пилот + US5 подсказки → жюри может кликать что угодно
6. Polish lint/build/quickstart

### Parallel Team Strategy

- Вместе: Phase 1–2
- A: US1 затем US5
- B: US2 затем пересечения на `vacancies/[id]/page.tsx`
- C: US4 пилот-файлы
- US3 после B или тем же человеком, что доска/отчёт

---

## Notes

- [P] только разные файлы
- Не добавлять Motion, lucide в новые места, новые npm
- Не менять маршруты 005
- Канон Дмитрий/Никита/Лидия не переносить из «Отчёт готов»
- `tasks.md` не создаёт автотесты
- Код не начинать, пока человек не примет этот список (constitution: human review перед implement)
