# Research: 005-evidence-interview-ui

## Decision: UI source of truth is the screen spec, not live-call architecture

- **Decision**: Демо-фронт строится по спецификации экранов (асинхронное интервью с доказательствами).
- **Rationale**: Пользователь явно задал экраны, словарь статусов и демо-путь. Документ `docs/Архитектура и дизайн MVP.md` описывает живой видеозвонок с агентом и баллами — это другой продукт.
- **Alternatives considered**: Реализовать заглушку `/interview/[token]` как видеотайлы. Отклонено: ломает кейс Napoleon и демо жюри.

## Decision: Frontend-only mocks

- **Decision**: Никаких новых backend-эндпоинтов. Демо-данные в `frontend/lib/demo`. Сессия кандидата в `sessionStorage`.
- **Rationale**: spec 003 ещё не реализован (backend только `/health`). Раздел 10 экранов прямо требует имитацию.
- **Alternatives considered**: Сразу писать FastAPI CRUD. Отклонено: блокирует сдачу UI.

## Decision: Napoleon tokens inside Next.js, not a Vite port

- **Decision**: Оставить `frontend/` на Next.js App Router + Tailwind v4 + shadcn Button. Перенести семантические токены из `tokens.css` в `app/globals.css`. Компоненты продукта — свои, не дефолтный shadcn dashboard.
- **Rationale**: Constitution фиксирует стек. Прототип Vite+JSX нельзя просто скопировать в корень.
- **Alternatives considered**: Заменить Next на Vite как в кейсе. Отклонено: ломает Docker baseline и constitution.

## Decision: Phosphor icons, Helvetica/system sans, cobalt accent

- **Decision**: Иконки `@phosphor-icons/react`. Шрифт: системный стек Helvetica Neue как в прототипе (не Inter). Акцент `#140af0`.
- **Rationale**: Прототип и бренд Napoleon. Taste-skill запрещает Inter как дефолт и смешение семей иконок.
- **Alternatives considered**: Оставить Inter + lucide из каркаса. Отклонено: выглядит как шаблон и расходится с кейсом.

## Decision: Candidate motion low, recruiter almost static

- **Decision**: Кандидат: VARIANCE 5, MOTION 4, DENSITY 3. Внутренние роли: 4 / 3 / 5. Только transform/opacity, `prefers-reduced-motion`.
- **Rationale**: PRODUCT.md: спокойный рабочий инструмент. Taste-skill не для дашбордов; на R/E/M — плотность и таблицы.
- **Alternatives considered**: Кинетический лендинг. Отклонено: anti-reference в PRODUCT.md.

## Decision: Pilot screens are routed static pages

- **Decision**: Пилот-маршруты существуют и показывают макет с бейджем «Пилот». Кнопки либо disabled, либо ведут на тост.
- **Rationale**: Пользователь выбрал «MVP + пилот как макеты».
- **Alternatives considered**: Спрятать пилот за 404. Отклонено: жюри не увидит следующий шаг.
