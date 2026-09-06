"""Чтение `Interview`/`Vacancy`/`Question` из Postgres — заменяет
`interview_directory.py` (удалён, см. его же docstring и
`specs/004-candidate-interview-flow/contracts/consent-info.md`, «Временная реализация»).

Владелец схемы — [[003-recruiter-vacancy-management]] (CRUD рекрутёра туда и не входит
сюда) — этот модуль только читает то, что нужно кандидатскому флоу: валидация
`access_token`/`status` (WS-хендшейк, LiveKit-токен) и данные экрана согласия.
"""

from __future__ import annotations

from typing import Literal, TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.interview import Interview
from app.models.question import Question
from app.models.vacancy import Vacancy

# Фиксированный оверхед на согласие/камеру/вступительный и финальный вопрос (раздел 2.1.2
# архитектурного документа упоминает его как компонент нижней границы, но не даёт числа —
# 5 минут, консервативная оценка на все нецелевые шаги; поправить, когда 003 зафиксирует
# точное значение).
_FIXED_OVERHEAD_SECONDS = 5 * 60
# Полный адаптивный бюджет интервью (раздел 2.3.1 — «3-4 за интервью»); для верхней
# границы берём максимум.
_MAX_ADAPTIVE_QUESTIONS = 4


class DurationRange(TypedDict):
    min: int
    max: int


class ConsentInfo(TypedDict):
    interview_id: str
    status: Literal["created", "in_progress", "completed", "processing_failed"]
    vacancy_title: str
    questions_total: int
    estimated_duration_min: DurationRange
    # Текст ОСНОВНОГО вопроса, персистентный на бэке (см. Interview.current_question_text) —
    # источник правды для reconnect/перезагрузки, не только текущий WS ControlEvent.
    current_question_text: str | None


async def get_interview_by_access_token(session: AsyncSession, access_token: str) -> Interview | None:
    result = await session.execute(select(Interview).where(Interview.access_token == access_token))
    return result.scalar_one_or_none()


async def build_consent_info(session: AsyncSession, interview: Interview) -> ConsentInfo:
    vacancy = await session.get(Vacancy, interview.vacancy_id)
    assert vacancy is not None  # FK not null — гарантировано схемой

    # Базовые вопросы вакансии на момент создания интервью (interview_id IS NULL) — то же
    # ядро, что показывается рекрутёру при живом пересчёте (раздел 2.1.2).
    base_questions = await session.execute(
        select(Question.estimated_duration_sec).where(
            Question.vacancy_id == interview.vacancy_id, Question.interview_id.is_(None)
        )
    )
    durations = [row[0] for row in base_questions.all()]
    base_total = sum(durations)
    lower_bound_sec = base_total + _FIXED_OVERHEAD_SECONDS

    avg_question_sec = base_total / len(durations) if durations else 0
    upper_bound_sec = lower_bound_sec + _MAX_ADAPTIVE_QUESTIONS * avg_question_sec

    return {
        "interview_id": str(interview.id),
        "status": interview.status,  # type: ignore[typeddict-item]
        "vacancy_title": vacancy.title,
        "questions_total": len(durations),
        "estimated_duration_min": {
            "min": round(lower_bound_sec / 60),
            "max": round(upper_bound_sec / 60),
        },
        "current_question_text": interview.current_question_text,
    }
