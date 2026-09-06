# Feature Specification: Pilot product model

**Feature Branch**: `009-pilot-product-model` (`feat/ui-on-main`)

**Created**: 2026-09-05

**Status**: In progress

**Input**: Целевая карта пилота: 4 роли + вспомогательный админ; жизненный цикл вакансии; оболочка кандидата `/i/[token]/*` вокруг LiveKit; три оси после отчёта; менеджер только после явной передачи.

## Синхронизация с кодом

База — живой `origin/main` (auth, vacancy CRUD, approve, LiveKit, control-channel). Макет `feat/frontend-ui` **не мержим**. Переносим только атомы/токены и вёрстку очередей. Спеки `005`/`006`/`007` на этой ветке — backend-фичи; UI-спеки макета не копировать по номеру.

SZ-03 («extra только эксперт») **уступает этой карте**: рекрутер может заказать доп. ответ, экспертный аудит — независимая ось.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Рекрутер ведёт вакансию до активации (P1)

Рекрутер создаёт вакансию, извлекает требования, отправляет эксперту. Эксперт калибрует или возвращает на правки, затем одобряет **версию**. Рекрутер активирует. До активации инвайт недоступен.

**Acceptance**:

1. **Given** вакансия `draft`, **When** generate questions, **Then** статус `extracted`.
2. **Given** `extracted`, **When** recruiter sends to expert, **Then** `calibration`.
3. **Given** `calibration`, **When** expert requests changes, **Then** `changes_requested`.
4. **Given** `calibration` с валидными assessment-вопросами, **When** expert approves, **Then** `approved` и создаётся rubric version; инвайт ещё 422.
5. **Given** `approved`, **When** recruiter activates, **Then** `active` и `POST .../interviews` создаёт ссылку `/i/{token}`.

### User Story 2 — Контуры ролей (P1)

Рекрутер home `/vacancies`, эксперт `/expert` + аудиты `/expert/queue`, менеджер `/manager`. Админ — `/internal/users`, без кадровых решений. Кандидат входит по токену.

### User Story 3 — Кандидатская оболочка вокруг LiveKit (P1)

URL `/i/[token]` (приглашение) → consent → check → rules → practice → live (существующий LiveKit) → done без внутренней оценки. Нет LaptopGate. Нет `/result` с картой требований. `/interview/{token}` редиректит в оболочку или в live.

### User Story 4 — Три оси после отчёта (P2)

На карточке кандидата независимы: статус отчёта, extra/audit, решение рекрутера. Передача менеджеру заблокирована, пока открыто уточнение (кроме закрытия с причиной).

### User Story 5 — Менеджер изолирован (P2)

`/manager` только handoff или временный «запрос мнения». До передачи — обезличенные счётчики. Прокторинг менеджеру не показывается.

## Constraints

- Эксперт не создаёт инвайты и не принимает кадровое решение.
- AI не ставит финальный балл.
- Главная кнопка называет действие; disabled — с подсказкой.
- Фейковые отчёты из макета на живые интервью не подставлять.
- `livekit-client`, vitest и interview-компоненты main не перезаписывать макетом.
