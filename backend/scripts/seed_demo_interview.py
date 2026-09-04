"""Разовый dev-скрипт: создаёт Recruiter/Vacancy/Question*/Interview на реальном Postgres
и печатает `access_token`, готовый для `/interview/{access_token}` во фронте.

Нужен, потому что CRUD рекрутёра (specs/003-recruiter-vacancy-management) ещё не
реализован — иначе получить реальный `access_token` для ручной проверки
[[004-candidate-interview-flow]] неоткуда (см. `specs/004-candidate-interview-flow/
tasks.md`, T004, «Known Gaps»). Вопросы совпадают по тексту с
`live-agent/mock_data/interview_example.json` — вакансия/вопросы намеренно захардкожены
(решение пользователя от 2026-09-04), это не попытка выдать за настоящий CRUD.

Запуск (нужен доступный Postgres — см. backend/README.md, «Миграции»). Именно как модуль
(`-m`), не `python scripts/seed_demo_interview.py` напрямую — иначе `sys.path[0]`
оказывается `scripts/`, а не `/app` (WORKDIR контейнера), и `import app.db` падает с
`ModuleNotFoundError: No module named 'app'` (найдено на практике при первом реальном
прогоне на self-hosted раннере):
    uv run python -m scripts.seed_demo_interview
"""

from __future__ import annotations

import asyncio
import secrets

from app.db import SessionLocal
from app.models import Interview, Question, Recruiter, Vacancy

_QUESTIONS = [
    "Расскажите почему вы сейчас находитесь в поиске работы и что для себя ищите? "
    "Каким проектом и какими задачами хотелось бы заниматься?",
    "Расскажите про свой продакшн-сервис на Python с очередью — Kafka или RabbitMQ. "
    "Какие библиотеки, как добивались, чтобы сообщение не потерялось и не обработалось дважды, "
    "и что делали с необработанными сообщениями?",
    "Как вы загружали большие объёмы данных в PostgreSQL? Назовите объёмы, как была устроена "
    "загрузка и как находили причину медленных запросов?",
    "Расскажите про CI/CD-пайплайн для Python-сервиса в контейнерах, который настраивали сами. "
    "Что делал пайплайн, как собирали Docker-образ, как деплоили и откатывались?",
    "Когда выбираете асинхронный код, а когда синхронный? Опишите на примере из своего проекта. "
    "И что будет, если внутри асинхронного кода вызвать блокирующую функцию?",
    "Расскажите как используете ИИ в своей работе?",
]


async def main() -> None:
    async with SessionLocal() as session:
        recruiter = Recruiter(email="demo-recruiter@example.com", name="Demo Recruiter", password_hash="x")
        session.add(recruiter)
        await session.flush()

        vacancy = Vacancy(
            recruiter_id=recruiter.id,
            title="Middle + Python Developer",
            description="Разработка и поддержка высоконагруженных микросервисов на Python.",
            grade="middle+",
            status="ready",
        )
        session.add(vacancy)
        await session.flush()

        for i, text in enumerate(_QUESTIONS):
            session.add(
                Question(
                    vacancy_id=vacancy.id,
                    text=text,
                    order=i,
                    estimated_duration_sec=180,
                    format="voice",
                    source="base_manual",
                )
            )

        access_token = secrets.token_urlsafe(24)
        interview = Interview(
            vacancy_id=vacancy.id,
            candidate_name="Демо-кандидат",
            resume_file_url="s3://dev-bucket/demo-resume.pdf",
            access_token=access_token,
        )
        session.add(interview)
        await session.commit()

        print(f"interview_id={interview.id}")
        print(f"access_token={access_token}")
        print(f"URL: http://localhost:3000/interview/{access_token}")


if __name__ == "__main__":
    asyncio.run(main())
