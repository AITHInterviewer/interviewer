"""Pydantic-схемы для evaluation-agent ↔ backend (specs/005-batch-evaluation-contour).

Контракт: backend отдаёт `EvaluationInputResponse`, evaluation-agent возвращает
`EvaluationCreateRequest`. Обе схемы независимы от ORM-моделей, чтобы агент мог
копировать только нужные поля.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.interview import InterviewEventResponse, InterviewResponse


class SkillScore(BaseModel):
    skill_tag: str
    score: int = Field(..., ge=0, le=100)
    rationale: str


class Quote(BaseModel):
    text: str
    question_id: UUID | None = None


class Contradiction(BaseModel):
    quote_a: Quote
    quote_b: Quote
    description: str


class PerQuestionEvaluation(BaseModel):
    question_id: UUID
    skill_scores: list[SkillScore]
    quotes: list[Quote] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
    answered_with_hint: bool = False
    report: str | None = None


class AnswerForEvaluationResponse(BaseModel):
    transcript_text: str | None = None
    code_submission: str | None = None
    code_language: str | None = None
    code_snapshots: list = Field(default_factory=list)
    started_at: datetime
    completed_at: datetime | None = None


class QuestionForEvaluationResponse(BaseModel):
    question_id: UUID
    text: str
    skill_tag: list[str]
    intent: str | None = None
    reference_answer: str | None = None
    difficulty: str
    format: str
    role: str
    dynamic_trigger: str | None = None
    source: str
    answer: AnswerForEvaluationResponse | None = None
    answered_with_hint: bool = False


class VacancyContextResponse(BaseModel):
    title: str
    description: str
    grade: str
    required_skills: list[str]
    nice_to_have_skills: list[str]


class EvaluationInputResponse(BaseModel):
    interview: InterviewResponse
    vacancy: VacancyContextResponse
    questions: list[QuestionForEvaluationResponse]
    events: list[InterviewEventResponse]


class EvaluationJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    interview_id: UUID
    status: str
    attempts: int
    max_attempts: int
    last_error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class EvaluationJobFailRequest(BaseModel):
    error: str


class EvaluationCreateRequest(BaseModel):
    per_question: list[PerQuestionEvaluation]
    overall_score: int | None = Field(None, ge=0, le=100)
    verdict: str
    confirmed_skills: list[str] = Field(default_factory=list)
    unconfirmed_skills: list[str] = Field(default_factory=list)
    contradictions_found: list[Contradiction] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    summary_intro: str | None = None
    summary_conclusion: str | None = None
    model_version: str | None = None
    prompt_version: str | None = None
    generated_at: datetime | None = None


class EvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    interview_id: UUID
    per_question: list
    overall_score: int | None
    verdict: str
    confirmed_skills: list[str]
    unconfirmed_skills: list[str]
    contradictions_found: list
    strengths: list[str]
    risks: list[str]
    summary_intro: str | None
    summary_conclusion: str | None
    model_version: str | None
    prompt_version: str | None
    generated_at: datetime | None
    created_at: datetime
