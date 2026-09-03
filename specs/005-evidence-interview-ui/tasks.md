# Tasks: Экраны доказательного техинтервью

**Input**: Design documents from `/specs/005-evidence-interview-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-routes.md, quickstart.md

**Tests**: не входят (не запрошены). Проверка: lint, build, ручной демо-путь.

## Phase 1: Setup

- [x] T001 Поставить `@phosphor-icons/react` в `frontend/package.json`
- [x] T002 [P] Перенести токены Napoleon в `frontend/app/globals.css` (canvas/surface/ink/accent/status/radius), светлая и тёмная тема через `data-theme`
- [x] T003 [P] Обновить `frontend/app/layout.tsx`: lang=ru, без Inter, системный Helvetica Neue стек, metadata Napoleon [Interview]
- [x] T004 Поправить `.specify/memory/constitution.md`: добавить `specs/005-evidence-interview-ui/` как владельца демо-UI `frontend/`

## Phase 2: Foundational

- [x] T005 Типы и сиды в `frontend/lib/demo/types.ts`, `vacancies.ts`, `candidates.ts`, `rubric.ts`
- [x] T006 Сессия кандидата `frontend/lib/demo/session.ts` (sessionStorage)
- [x] T007 [P] Компоненты: `StatusBadge`, `EvidenceLink`, `AiNote`, `HumanNote`, `Drawer`, `Stepper`, `VersionTag`, `AppShell`, `CandidateShell` в `frontend/components/`
- [x] T008 Редирект `/` → `/login`; `/interview/[token]` → `/i/[token]`
- [x] T009 `frontend/app/login/page.tsx` (S1) и S2: `403`, `404`, `i/expired`

**Checkpoint**: логин и пустые оболочки ролей открываются

## Phase 3: US1 Кандидат (P1)

- [x] T010 [US1] C1 `frontend/app/i/[token]/page.tsx`
- [x] T011 [US1] C2 consent
- [x] T012 [US1] C3 check (имитация записи 5 сек + текстовый режим)
- [x] T013 [US1] C4 rules
- [x] T014 [US1] C5 practice
- [x] T015 [US1] C6 question states preparing/recording/typing/saved
- [x] T016 [US1] C7 follow-up
- [x] T017 [US1] C8 resume
- [x] T018 [US1] C9 done
- [x] T019 [US1] Узкая ширина: C1 без «Начать»; с C3 экран «Откройте с ноутбука»

**Checkpoint**: токен `lida` проходит до C9

## Phase 4: US2 Отчёт (P1)

- [x] T020 [US2] R3 канбан `frontend/app/vacancies/[id]/page.tsx` + переключатель список
- [x] T021 [US2] R5 отчёт `.../candidates/[cid]/page.tsx` с drawer, картой требований, прокторингом, историей
- [x] T022 [US2] R6 модалка доп. ответа
- [x] T023 [US2] Панель решения + HumanNote
- [x] T024 [US2] Ссылка «Посмотреть как менеджер» → M4

**Checkpoint**: неоднозначный кандидат разбирается end-to-end

## Phase 5: US3 Вакансии и инвайт (P2)

- [x] T025 [US3] R1 таблица `frontend/app/vacancies/page.tsx` + пустое состояние + вкладки
- [x] T026 [US3] R2 три шага `vacancies/new/page.tsx` с имитацией извлечения
- [x] T027 [US3] R4 модалка приглашения с предпросмотром письма и тостом

## Phase 6: US4 Эксперт, менеджер, навигация (P2)

- [x] T028 [US4] AppShell навигация: Вакансии (MVP); Эксперт видит свои ссылки
- [x] T029 [US4] E2 read-only `vacancies/[id]/rubric/page.tsx`
- [x] T030 [US4] E4 read-only `vacancies/[id]/questions/page.tsx`
- [x] T031 [US4] M4 `frontend/app/manager/[cid]/page.tsx`

## Phase 7: US5 Пилот-макеты (P3)

- [x] T032 [US5] C10, C12, C13 макеты + C11 заглушка
- [x] T033 [US5] R7 модалка экспорта (из R5), R8 settings
- [x] T034 [US5] E1, E5, E6
- [x] T035 [US5] M1, M2, M3

## Phase 8: Polish

- [x] T036 Тексты: словарь статусов дословно, кнопки-глаголы, help-строка у кандидата
- [x] T037 `frontend/README.md` — как запустить и демо-путь
- [x] T038 `npm run lint` и `npm run build` в `frontend/`
- [x] T039 Пройти quickstart.md в браузере

## Dependencies

Setup → Foundational → US1 и US2 можно почти параллельно после T007 → US3/US4 → US5 → polish.

## Implementation Strategy

Сначала US1+US2 (демо жюри). Затем R1/R2/R4, эксперт/M4, пилот-макеты.
