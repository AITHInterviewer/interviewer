from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

VacancyStatus = Literal["draft", "submitted_for_review", "changes_requested", "approved", "archived"]
VacancyGrade = Literal["intern", "junior", "middle", "senior", "lead"]
ReviewDecision = Literal["approved", "changes_requested"]
ViewerPermission = Literal[
    "vacancy.body.edit",
    "vacancy.questions.edit",
    "vacancy.submit",
    "vacancy.approve",
    "vacancy.request_changes",
    "vacancy.archive",
    "vacancy.restore",
    "vacancy.review_history.view",
]


class ExpectedUpdateRequest(BaseModel):
    expected_updated_at: datetime


class VacancyCreateRequest(BaseModel):
    title: str = ""
    grade: VacancyGrade | None = None
    job_description: str | None = None
    ideal_candidate_profile: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)


class VacancyUpdateRequest(ExpectedUpdateRequest):
    title: str | None = None
    grade: VacancyGrade | None = None
    job_description: str | None = None
    ideal_candidate_profile: str | None = None
    required_skills: list[str] | None = None
    nice_to_have_skills: list[str] | None = None


class QuestionPayloadBase(BaseModel):
    text: str | None = None
    order: int | None = None
    skill_tags: list[str] | None = None
    intent: str | None = None
    reference_answer: str | None = None
    format: str | None = None
    role: str | None = None
    difficulty: str | None = None
    estimated_duration_sec: int | None = Field(default=None, ge=0)
    stimulus: str | None = None
    source: str | None = None


class QuestionCreateRequest(ExpectedUpdateRequest, QuestionPayloadBase):
    text: str = Field(min_length=1)


class QuestionUpdateRequest(ExpectedUpdateRequest, QuestionPayloadBase):
    pass


class ReviewDecisionRequest(ExpectedUpdateRequest):
    comment: str = ""


class VacancyQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    text: str
    order: int
    skill_tags: list[str] | None = None
    intent: str | None = None
    reference_answer: str | None = None
    format: str
    role: str
    difficulty: str
    estimated_duration_sec: int | None = None
    stimulus: str | None = None
    source: str
    updated_at: datetime


class ReviewStateResponse(BaseModel):
    status: VacancyStatus
    latest_review_decision: ReviewDecision | None = None
    latest_review_comment: str | None = None
    latest_reviewed_at: datetime | None = None
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    approved_by_user_id: str | None = None
    archived_at: datetime | None = None
    archived_by_user_id: str | None = None


class VacancySummaryResponse(BaseModel):
    id: str
    title: str
    grade: VacancyGrade | None = None
    status: VacancyStatus
    question_count: int
    updated_at: datetime
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    latest_review_decision: ReviewDecision | None = None


class VacancyDetailResponse(BaseModel):
    id: str
    title: str
    grade: VacancyGrade | None = None
    job_description: str | None = None
    ideal_candidate_profile: str | None = None
    required_skills: list[str]
    nice_to_have_skills: list[str]
    status: VacancyStatus
    created_by_recruiter_id: str
    created_by_user_id: str
    managing_recruiter_id: str
    created_at: datetime
    updated_at: datetime
    questions: list[VacancyQuestionResponse]
    review_state: ReviewStateResponse
    viewer_permissions: list[ViewerPermission]


class VacancyListResponse(BaseModel):
    items: list[VacancySummaryResponse]


class VacancyQuestionMutation(QuestionPayloadBase):
    text: str = Field(min_length=1)


class QuestionUpdateData(QuestionPayloadBase):
    @model_validator(mode="after")
    def require_one_field(self) -> "QuestionUpdateData":
        if all(getattr(self, field) is None for field in self.model_fields):
            raise ValueError("At least one question field must be provided.")
        return self


ExpectedUpdatedAt = Annotated[datetime, Field()]
