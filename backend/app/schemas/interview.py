from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class InterviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vacancy_id: UUID
    candidate_name: str | None
    resume_file_url: str
    access_token: str
    status: str
    dynamic_questions_used: int
    created_at: datetime
    completed_at: datetime | None
    product_state: str = "invited"
    report_json: dict | None = None
    recording_url: str | None = None
    recruiter_decision: str = "awaiting"
    rubric_version_id: UUID | None = None


class InterviewListResponse(BaseModel):
    items: list[InterviewResponse]


class CreateInterviewResponse(BaseModel):
    interview: InterviewResponse
    candidate_link: str


class InterviewEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    interview_id: UUID
    event_type: str
    payload: dict
    created_at: datetime


class AnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    interview_id: UUID
    question_id: UUID
    question_text: str | None = None
    role: str
    video_url: str | None
    audio_url: str | None
    transcript_text: str | None
    code_submission: str | None
    code_language: str | None
    code_snapshots: list
    started_at: datetime
    completed_at: datetime | None


class InterviewEventsResponse(BaseModel):
    interview: InterviewResponse
    events: list[InterviewEventResponse]
    answers: list[AnswerResponse]
