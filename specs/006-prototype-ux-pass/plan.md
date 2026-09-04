# Implementation Plan: Полировка демо-UI по правилам Нильсена

**Branch**: `006-prototype-ux-pass` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-prototype-ux-pass/spec.md`

**Design read**: redesign-preserve существующего B2B-демо для жюри; язык Napoleon (монохром + кобальт); это продуктовый UI, не лендинг. Taste-skill применяется только к единообразию токенов, состояний и акцента. Hero, bento, marquee и кинетика не используются.

**Dials (preserve +1 motion)**: внутренние экраны VARIANCE 4 / MOTION 3 / DENSITY 6. Кандидатский мастер VARIANCE 5 / MOTION 4 / DENSITY 3. Один акцент, одна шкала скруглений, одна семья кнопок.

## Summary

Поверх уже собранных экранов 005 привести демо к общим правилам интерфейса: экран входа с именами и коротким попапом онбординга по роли, именные карточки во всех пяти стадиях канбана, смена роли с любого экрана, человеческие тексты и статусы, те же правила на пилот-макетах. Канбан и список остаются двумя видами одной доски. Визуально выровнять заголовки, цвета и кнопки через существующие токены, без нового стека и без смены бренда.

## Technical Context

**Language/Version**: TypeScript, Next.js 16, React 19 (как в `frontend/package.json`)

**Primary Dependencies**: уже стоят `next`, `react`, `tailwindcss` v4, `class-variance-authority`, `clsx`, `tailwind-merge`, `@phosphor-icons/react`. Новые npm-пакеты не добавляем. Lucide в новых местах не используем. Motion / GSAP не подключаем.

**Storage**: моки в `frontend/lib/demo` + `sessionStorage` (сессия кандидата, выбранная демо-роль). `localStorage` только для темы, как сейчас.

**Testing**: ручной [quickstart.md](./quickstart.md) + `npm run lint` + `npm run build`. Автотесты в эту фичу не входят.

**Target Platform**: desktop Chrome; кандидатский поток по-прежнему допускает узкий экран на C1–C2 и «откройте с ноутбука» с C3.

**Project Type**: web application, только `frontend/`

**Performance Goals**: без тяжёлых библиотек; попап и скелетон на CSS; анимация только `opacity` / `transform` и только если уже есть в продукте; `prefers-reduced-motion`.

**Constraints**: моки; без бэкенда, почты, ATS, live-агента; без процентов уверенности; без смены маршрутов 005; без нового визуального языка.

**Scale/Scope**: все маршруты контракта 005 (~33 экрана), 3 канонических кандидата + 4 карточки воронки, 6 демо-ролей.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-First Delivery** — PASS. spec.md есть до кода. FR-019 (единая шкала) добавлен в spec до этого плана.
- **II. Single SDD Source Of Truth** — PASS. Активная фича `specs/006-prototype-ux-pass/`. Смысл отчёта и шагов интервью остаётся в 005. 003/004 и агенты не трогаем. Constitution II ещё не перечисляет 006 — это PATCH конституции отдельно, не блокер плана.
- **III. Vertical Slices** — PASS. Пять US из spec: вход, канбан, MVP-Нильсен, пилот, помощь.
- **IV. Contract-First** — PASS. Backend не меняется. Контракты этой фичи — UI: дизайн-система, роли/попап, воронка. Маршруты 005 не ломаем.
- **V. Minimalism** — PASS. Переиспользуем `Modal`, `Button`, `AppShell`, `CandidateShell`, `page-title`. Не тащим shadcn-kit целиком, не порт лендинга, не новая библиотека токенов.

Post-design re-check: PASS. Артефакты Phase 1 не добавляют сервисов, ORM и новых границ FE/BE.

## Project Structure

### Documentation (this feature)

```text
specs/006-prototype-ux-pass/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── design-system.md
│   ├── demo-roles.md
│   └── pipeline.md
├── checklists/requirements.md
└── spec.md
```

### Source Code (repository root)

```text
frontend/
├── app/
│   ├── globals.css              # токены + type scale
│   ├── product.css              # общие паттерны page-title, empty, modal
│   ├── layout.tsx
│   ├── login/page.tsx           # карточки ролей + онбординг-попап
│   ├── vacancies/[id]/page.tsx  # канбан + список, карточки всех стадий
│   ├── vacancies/[id]/candidates/[cid]/page.tsx
│   ├── i/[token]/...            # нет пустого первого кадра
│   └── …пилот-маршруты 005
├── components/
│   ├── chrome/{AppShell,CandidateShell,Stepper,VersionTag}.tsx
│   ├── evidence/{StatusBadge,AiNote,HumanNote,Drawer}.tsx
│   ├── ui/button.tsx
│   └── chrome/PageHeader.tsx    # если повторяющийся JSX page-title вынесем
├── lib/demo/
│   ├── types.ts
│   ├── vacancies.ts
│   ├── candidates.ts            # канон + карточки воронки
│   ├── roles.ts                 # NEW: роли, тексты попапа, home
│   └── session.ts
└── package.json                 # без новых зависимостей
```

**Structure Decision**: только существующий `frontend/` на App Router. Backend, агенты и `docs/` в поставку 006 не входят.

## Complexity Tracking

Нет нарушений constitution, таблица пустая.
