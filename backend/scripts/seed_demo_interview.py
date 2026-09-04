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
import os
import secrets

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Interview, Question, Recruiter, Vacancy

_DEMO_RECRUITER_EMAIL = "demo-recruiter@example.com"
_DEMO_VACANCY_TITLE = "Middle + Python Developer"

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
    # Идемпотентно по recruiter/vacancy/questions — повторный запуск переиспользует их
    # (иначе падает на unique-constraint по email при второй попытке, как уже случалось
    # на практике) и создаёт только новый Interview+access_token, что и нужно от
    # "запустить ещё раз, получить свежую ссылку".
    async with SessionLocal() as session:
        recruiter = (
            await session.execute(select(Recruiter).where(Recruiter.email == _DEMO_RECRUITER_EMAIL))
        ).scalar_one_or_none()
        if recruiter is None:
            recruiter = Recruiter(email=_DEMO_RECRUITER_EMAIL, name="Demo Recruiter", password_hash="x")
            session.add(recruiter)
            await session.flush()

        vacancy = (
            await session.execute(
                select(Vacancy).where(
                    Vacancy.recruiter_id == recruiter.id, Vacancy.title == _DEMO_VACANCY_TITLE
                )
            )
        ).scalar_one_or_none()
        if vacancy is None:
            vacancy = Vacancy(
                recruiter_id=recruiter.id,
                title=_DEMO_VACANCY_TITLE,
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

        frontend_url = os.environ.get("PUBLIC_FRONTEND_URL", "http://localhost:3000")
        print(f"interview_id={interview.id}")
        print(f"access_token={access_token}")
        print(f"URL: {frontend_url}/interview/{access_token}")


if __name__ == "__main__":
    asyncio.run(main())
