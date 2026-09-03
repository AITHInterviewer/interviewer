# Implementation Plan: Экраны доказательного техинтервью

**Branch**: `005-evidence-interview-ui` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: `/specs/005-evidence-interview-ui/spec.md`

## Summary

Собрать в `frontend/` полный набор экранов хакатонного демо: кандидатский поток C1–C9,
рекрутёр R1–R6, E2/E4 read-only, M4, служебные S1/S2, плюс пилот-маршруты как макеты.
Визуальный язык — Napoleon-токены. Данные — моки. Бэкенд не трогаем.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (уже в `frontend/package.json`), React 19

**Primary Dependencies**: существующие `next`, `react`, `tailwindcss` v4, `class-variance-authority`, `clsx`, `tailwind-merge`; добавить `@phosphor-icons/react` (иконки прототипа и taste-skill). Lucide в новых экранах не использовать.

**Storage**: in-memory demo module + `sessionStorage` для сессии кандидата

**Testing**: ручной quickstart + `npm run lint` + `npm run build`. Автотесты не входят в эту фичу.

**Target Platform**: desktop Chrome; кандидат C1–C2 допускают узкую ширину; с C3 при <900 px — экран «ноутбук»

**Project Type**: web application, только `frontend/`

**Performance Goals**: LCP стартовых экранов без тяжёлых библиотек; Motion не подключать глобально

**Constraints**: не показывать % уверенности; не графики; не live-agent UI; не новые npm-пакеты кроме Phosphor

**Scale/Scope**: ~25 маршрутов, 3 демо-кандидата, 1 вакансия

## Constitution Check

- **I. Spec-First Delivery** — PASS. spec.md написан до кода.
- **II. Single SDD Source Of Truth** — PASS после правки constitution: эта фича живёт в `specs/005-evidence-interview-ui/` и владеет UI `frontend/` для демо.
- **III. Vertical Slices** — PASS. US1 кандидат, US2 отчёт, US3 вакансии/инвайт, US4 эксперт/менеджер/вход, US5 пилот-макеты.
- **IV. Contract-First** — PASS. Контракт маршрутов в `contracts/ui-routes.md`. Backend API не расширяем.
- **V. Minimalism** — PASS. Не порт Vite-приложения целиком; токены + маршруты + моки. Не тащим GSAP/Motion без нужды.

Post-design re-check: PASS.

## Project Structure

```text
specs/005-evidence-interview-ui/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-routes.md
├── checklists/requirements.md
└── tasks.md

frontend/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx                 # redirect /login
│   ├── login/page.tsx
│   ├── 403/page.tsx
│   ├── 404/page.tsx
│   ├── i/expired/page.tsx
│   ├── i/[token]/...
│   ├── vacancies/...
│   ├── expert/page.tsx
│   ├── audit/[vacancyId]/page.tsx
│   ├── brief/[id]/...
│   └── manager/...
├── components/
│   ├── ui/button.tsx            # keep, restyle via tokens
│   ├── chrome/{AppShell,CandidateShell,Stepper,VersionTag}.tsx
│   ├── evidence/{StatusBadge,EvidenceLink,AiNote,HumanNote,Drawer}.tsx
│   └── ...
└── lib/demo/{types.ts,vacancies.ts,candidates.ts,session.ts}
```

**Structure Decision**: Option 2, но меняется только `frontend/` (App Router). Backend не в скоупе.

## Design read

Reading this as: product UI for Napoleon IT hackathon (evidence-based async interview), for recruiters and candidates, with a calm precise language, leaning toward Napoleon tokens (monochrome + cobalt) on Next.js/Tailwind. Taste-skill applies to C1–C9. Recruiter/expert/manager are dense product surfaces.

Dials: candidate 5/4/3; internal 4/3/5.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Новая фича 005 рядом с 003/004 | UI описывает другой продукт, чем live-call спеки | Переписать 003/004 уничтожит backend-план |
