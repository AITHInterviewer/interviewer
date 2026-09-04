# UI routes (frontend contract)

Это контракт маршрутов и демо-навигации, не HTTP API.

## Public / candidate

| Route | Screen | Mode |
|---|---|---|
| `/i/:token` | C1 | MVP |
| `/i/:token/consent` | C2 | MVP |
| `/i/:token/check` | C3 | MVP |
| `/i/:token/rules` | C4 | MVP |
| `/i/:token/practice` | C5 | MVP |
| `/i/:token/q/:n` | C6 | MVP |
| `/i/:token/q/:n/follow-up` | C7 | MVP |
| `/i/:token/resume` | C8 | MVP |
| `/i/:token/done` | C9 | MVP |
| `/i/:token/extra/:id` | C10 | Пилот-макет |
| `/i/:token/transcript` | C11 | Заглушка «позже» |
| `/i/:token/result` | C12 | Пилот-макет |
| `/i/:token/request` | C13 | Пилот-макет |
| `/i/expired` | S2 | MVP |

## Internal

| Route | Screen | Mode |
|---|---|---|
| `/login` | S1 | MVP |
| `/403` `/404` | S2 | MVP |
| `/vacancies` | R1 | MVP |
| `/vacancies/new` | R2 | MVP |
| `/vacancies/:id` | R3 | MVP; R4 modal |
| `/vacancies/:id/candidates/:cid` | R5 | MVP; R6/R7 modal |
| `/vacancies/:id/settings` | R8 | Пилот-макет |
| `/vacancies/:id/rubric` | E2 | MVP read-only |
| `/vacancies/:id/questions` | E4 | MVP read-only |
| `/vacancies/:id/approve` | E5 | Пилот-макет |
| `/expert` | E1 | Пилот-макет |
| `/audit/:vacancyId` | E6 | Пилот-макет |
| `/brief/:id` | M1 | Пилот-макет |
| `/brief/:id/confirm` | M2 | Пилот-макет |
| `/manager` | M3 | Пилот-макет |
| `/manager/:cid` | M4 | MVP |
| `/admin` | A1–A4 | Не делаем |

## Demo login targets

- Рекрутер → `/vacancies`
- Эксперт → `/vacancies/python-middle/rubric`
- Менеджер → `/manager/lida`
- Админ → `/vacancies`
- Кандидат №1/2/3 → `/i/dmitry` `/i/nikita` `/i/lida`

## Redirects

- `/` → `/login`
- `/interview/:token` → `/i/:token` (старый каркас не оставлять как видеозвонок)
