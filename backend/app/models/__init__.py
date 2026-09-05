"""SQLAlchemy models (specs/003-recruiter-vacancy-management, data-model.md).

Импортировать все модули с моделями здесь — Alembic autogenerate и `Base.metadata.create_all`
(тесты) обходят таблицы через `Base.registry`, для чего каждый модуль модели должен быть
хотя бы раз импортирован до вызова.
"""

from app.models.answer import Answer
from app.models.clarification import ClarificationRequest
from app.models.handoff import Handoff
from app.models.interview import Interview
from app.models.interview_event import InterviewEvent
from app.models.manager_opinion_grant import ManagerOpinionGrant
from app.models.question import Question
from app.models.recruiter import Recruiter
from app.models.role_assignment import InternalRoleAssignment
from app.models.rubric_version import RubricVersion
from app.models.user import InternalUser
from app.models.vacancy import Vacancy

__all__ = [
    "Answer",
    "ClarificationRequest",
    "Handoff",
    "Interview",
    "InterviewEvent",
    "InternalRoleAssignment",
    "InternalUser",
    "ManagerOpinionGrant",
    "Question",
    "Recruiter",
    "RubricVersion",
    "Vacancy",
]
