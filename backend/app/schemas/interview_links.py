from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

InterviewLinkStatus = Literal["active", "in_progress", "completed", "expired", "revoked", "blocked"]
InterviewUnavailableReason = Literal["expired", "revoked", "vacancy_closed"]
InterviewCardState = Literal["available", "in_progress", "completed", "unavailable"]


class InterviewLinkCreateRequest(BaseModel):
    candidate_first_name: str = Field(min_length=1, max_length=120)
    candidate_last_name: str = Field(min_length=1, max_length=120)
    candidate_social: str = Field(min_length=1, max_length=300)
    candidate_email: EmailStr | None = Field(default=None, max_length=320)
    expires_at: datetime


class InterviewLinkExtendRequest(BaseModel):
    expires_at: datetime


class InterviewLinkItem(BaseModel):
    id: str
    token: str
    candidate_first_name: str
    candidate_last_name: str
    candidate_social: str
    candidate_email: str | None
    expires_at: datetime
    status: InterviewLinkStatus
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class InterviewLinkListResponse(BaseModel):
    items: list[InterviewLinkItem]


class InterviewCardResponse(BaseModel):
    state: InterviewCardState
    reason: InterviewUnavailableReason | None = None
    vacancy_title: str
    candidate_first_name: str
    candidate_last_name: str | None = None
    expires_at: datetime | None = None
    deadline_at: datetime | None = None
    interview_time_limit_minutes: int | None = None
