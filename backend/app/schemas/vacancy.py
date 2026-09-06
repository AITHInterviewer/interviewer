from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vacancy_id: UUID
    text: str
    order: int
    skill_tag: list[str]
    intent: str | None
    reference_answer: str | None
    format: str
    role: str
    difficulty: str
    estimated_duration_sec: int
    stimulus: dict | None
    source: str
    dynamic_trigger: str | None
    parent_question_id: UUID | None


class RequirementModel(BaseModel):
    """Требование вакансии, вычлененное из описания (specs/010-vacancy-from-description).
    `id` — стабильный ключ для UI, генерится на фронте; бэкенд его не интерпретирует."""

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["must", "nice"] = "must"
    level: Literal["basic", "confident", "expert"] = "confident"
    checked: bool = False
    evidence: str = ""
    source: Literal["llm", "manual", "edited"] = "llm"


class ExcludedFragmentModel(BaseModel):
    text: str = ""
    reason: str = ""


class ExtractRequirementsResponse(BaseModel):
    title: str
    grade: str
    description: str
    description_file_name: str | None = None
    requirements: list[RequirementModel]
    excluded: list[ExcludedFragmentModel] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class VacancyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recruiter_id: UUID
    expert_id: UUID | None
    hiring_manager_id: UUID | None
    title: str
    description: str
    grade: str
    required_skills: list[str]
    nice_to_have_skills: list[str]
    requirements: list[RequirementModel] = Field(default_factory=list)
    description_source: str = "text"
    description_file_name: str | None = None
    status: str
    created_at: datetime
    owner_next: str = "recruiter"
    questions: list[QuestionResponse] = Field(default_factory=list)

    @classmethod
    def from_model(cls, vacancy, questions: list) -> "VacancyResponse":
        from app.services.vacancy_service import VacancyService

        return cls(
            id=vacancy.id,
            recruiter_id=vacancy.recruiter_id,
            expert_id=vacancy.expert_id,
            hiring_manager_id=vacancy.hiring_manager_id,
            title=vacancy.title,
            description=vacancy.description,
            grade=vacancy.grade,
            required_skills=list(vacancy.required_skills),
            nice_to_have_skills=list(vacancy.nice_to_have_skills),
            requirements=list(vacancy.requirements or []),
            description_source=vacancy.description_source,
            description_file_name=vacancy.description_file_name,
            status=vacancy.status,
            created_at=vacancy.created_at,
            owner_next=VacancyService.owner_next(vacancy.status),
            questions=[QuestionResponse.model_validate(q) for q in questions],
        )


class ChangeRequestBody(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class VacancyListResponse(BaseModel):
    items: list[VacancyResponse]


class VacancyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1)
    grade: str = Field(min_length=1, max_length=100)
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    requirements: list[RequirementModel] = Field(default_factory=list)
    description_source: Literal["text", "pdf"] = "text"
    description_file_name: str | None = None
    expert_id: UUID | None = None
    hiring_manager_id: UUID | None = None


class VacancyUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, min_length=1)
    grade: str | None = Field(default=None, min_length=1, max_length=100)
    required_skills: list[str] | None = None
    nice_to_have_skills: list[str] | None = None
    requirements: list[RequirementModel] | None = None
    description_source: Literal["text", "pdf"] | None = None
    description_file_name: str | None = None
    # `None` явно означает «снять назначение» — поле применяется, только если
    # его прислали (см. `model_dump(exclude_unset=True)` в роутере).
    expert_id: UUID | None = None
    hiring_manager_id: UUID | None = None


class GenerateQuestionsResponse(BaseModel):
    questions: list[QuestionResponse]


class QuestionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    order: int | None = None
    skill_tag: list[str] = Field(default_factory=list)
    intent: str | None = None
    reference_answer: str | None = None
    format: str = "voice"
    role: str = "assessment"
    difficulty: str = "baseline"
    estimated_duration_sec: int = 180


class QuestionUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    order: int | None = None
    skill_tag: list[str] | None = None
    intent: str | None = None
    reference_answer: str | None = None
    format: str | None = None
    role: str | None = None
    difficulty: str | None = None
    estimated_duration_sec: int | None = None
