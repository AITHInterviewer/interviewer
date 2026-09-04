"""
ВРЕМЕННЫЙ код — см. `specs/004-candidate-interview-flow/contracts/consent-info.md`,
раздел "Временная реализация до готовности [[003-recruiter-vacancy-management]]".

003 ещё не поставил реальную таблицу `Interview` (backend на момент написания этого
файла реализует только `GET /health`) — этот модуль отдаёт то же тело ответа из
захардкоженного in-memory словаря, чтобы не блокировать 004 на чужой DB-схеме.

Когда 003 поставит `Interview`-модель и репозиторий — этот файл удаляется целиком,
`candidate_interview.py` переключается на чтение из Postgres, сохраняя тот же контракт
ответа (`consent-info.md`). Не добавляй сюда новую логику сверх текущей — любое
расширение поведения принадлежит настоящей реализации 003, не этой заглушке.
"""

from __future__ import annotations

from typing import Literal, TypedDict


class DurationRange(TypedDict):
    min: int
    max: int


class InterviewDirectoryEntry(TypedDict):
    interview_id: str
    status: Literal["created", "in_progress", "completed"]
    vacancy_title: str
    questions_total: int
    estimated_duration_min: DurationRange


_MOCK_INTERVIEWS: dict[str, InterviewDirectoryEntry] = {
    "demo-token": {
        "interview_id": "int-demo",
        "status": "created",
        "vacancy_title": "Backend-разработчик",
        "questions_total": 6,
        "estimated_duration_min": {"min": 25, "max": 40},
    },
    "demo-token-completed": {
        "interview_id": "int-demo-completed",
        "status": "completed",
        "vacancy_title": "Backend-разработчик",
        "questions_total": 6,
        "estimated_duration_min": {"min": 25, "max": 40},
    },
}


def get_interview_by_access_token(access_token: str) -> InterviewDirectoryEntry | None:
    return _MOCK_INTERVIEWS.get(access_token)
