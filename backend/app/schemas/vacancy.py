from datetime import datetime
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


class VacancyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recruiter_id: UUID
    title: str
    description: str
    grade: str
    required_skills: list[str]
    nice_to_have_skills: list[str]
    status: str
    created_at: datetime
    questions: list[QuestionResponse] = Field(default_factory=list)

    @classmethod
    def from_model(cls, vacancy, questions: list) -> "VacancyResponse":
        return cls(
            id=vacancy.id,
            recruiter_id=vacancy.recruiter_id,
            title=vacancy.title,
            description=vacancy.description,
            grade=vacancy.grade,
            required_skills=list(vacancy.required_skills),
            nice_to_have_skills=list(vacancy.nice_to_have_skills),
            status=vacancy.status,
            created_at=vacancy.created_at,
            questions=[QuestionResponse.model_validate(q) for q in questions],
        )


class VacancyListResponse(BaseModel):
    items: list[VacancyResponse]


class VacancyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1)
    grade: str = Field(min_length=1, max_length=100)
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)


class VacancyUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, min_length=1)
    grade: str | None = Field(default=None, min_length=1, max_length=100)
    required_skills: list[str] | None = None
    nice_to_have_skills: list[str] | None = None


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
