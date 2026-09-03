# Quickstart Validation: Рекрутёр — вакансии, интервью, отчёты

Проверяет US1–US3 из `spec.md` end-to-end через API-контракты (`contracts/api.md`), без
UI — фронтенд-проверка отдельным пунктом ниже. Требует, чтобы `tasks.md` (следующий шаг,
`speckit-tasks`) был выполнен хотя бы по US1+US2 для первого прогона.

## Prerequisites

```bash
# инфраструктура (Postgres, Redis, MinIO) — из корня репозитория
docker compose -f infra/docker-compose.yml up -d postgres minio

cd backend
uv sync --extra dev
cp .env.example .env   # дополнить DATABASE_URL, S3_*, ANTHROPIC_API_KEY после реализации
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Отдельным терминалом — засеять тестового рекрутёра (пока нет UI регистрации — прямая
запись в БД или временный dev-эндпоинт, решается в `tasks.md`).

## US1: Вакансия и генерация вопросов

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"recruiter@example.com","password":"..."}' | jq -r .access_token)

VACANCY_ID=$(curl -s -X POST http://localhost:8000/api/v1/vacancies \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Backend Python Engineer","description":"...","grade":"middle",
       "required_skills":["Python","PostgreSQL"],"nice_to_have_skills":["FastAPI"]}' \
  | jq -r .id)

curl -s -X POST http://localhost:8000/api/v1/vacancies/$VACANCY_ID/questions/generate \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected**: непустой `questions[]`, у каждого — непустые `skill_tag`, `intent`,
`reference_answer`, `estimated_duration_sec` (spec.md US1, Acceptance Scenario 1).

```bash
curl -s http://localhost:8000/api/v1/vacancies/$VACANCY_ID/duration-estimate \
  -H "Authorization: Bearer $TOKEN" | jq
curl -s -X POST http://localhost:8000/api/v1/vacancies/$VACANCY_ID/publish \
  -H "Authorization: Bearer $TOKEN" | jq '.status'
```

**Expected**: `duration-estimate` возвращает `min_sec < max_sec`; `publish` переводит
вакансию в `"ready"`.

## US2: Интервью и ссылка

```bash
curl -s -X POST http://localhost:8000/api/v1/vacancies/$VACANCY_ID/interviews \
  -H "Authorization: Bearer $TOKEN" \
  -F "resume_file=@./sample_resume.pdf" -F "candidate_name=Иван Иванов" | jq
```

**Expected**: `201`, `candidate_link` содержит непредсказуемый токен (не последовательный
ID) — визуально сравнить два токена подряд созданных интервью на отсутствие общего паттерна.

## US3: Таблица и отчёт (на засеянных данных до готовности batch-контура)

```bash
# засеять Evaluation + RecruiterDecision напрямую в БД для одного из созданных интервью —
# см. data-model.md за схемой; это временный шаг, пока [[005-batch-evaluation-contour]]
# не пишет Evaluation сам

curl -s http://localhost:8000/api/v1/vacancies/$VACANCY_ID/interviews \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s http://localhost:8000/api/v1/interviews/$INTERVIEW_ID/report \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X PUT http://localhost:8000/api/v1/interviews/$INTERVIEW_ID/decision \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"fits"}' | jq
```

**Expected**: таблица показывает и интервью без `Evaluation` (статус `created`/
`in_progress`, `overall_score`/`verdict` = `null`, без падения), и засеянное
(`overall_score`/`verdict` заполнены); отчёт возвращает все поля из `spec.md` US3 AS2;
`decision` сохраняется независимо от `evaluation.verdict`.

## Frontend

```bash
cd frontend
npm install && npm run dev
```

Пройти вручную: `/vacancies/new` → `/vacancies/[id]` (редактор вопросов, живой
пересчёт длительности) → создать интервью → `/vacancies/[id]/candidates` → клик по
строке → `/interviews/[id]/report`.

**Expected**: путь проходится без прямого обращения к API из консоли браузера — все
действия доступны через UI (US1–US3 полностью, `spec.md`, Success Criteria SC-001–SC-002).
