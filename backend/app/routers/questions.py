from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.dependencies.auth import require_capability
from app.models.user import InternalUser
from app.roles.catalog import ACTION_QUESTIONS_EDIT

router = APIRouter(prefix="/api/v1", tags=["questions"])


class QuestionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class QuestionResponse(BaseModel):
    id: str
    text: str


@router.post("/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    payload: QuestionCreate,
    _: Annotated[InternalUser, Depends(require_capability(ACTION_QUESTIONS_EDIT))],
) -> QuestionResponse:
    # Placeholder body: question persistence belongs to a future question-management
    # feature. This endpoint exists to enforce the capability gate (FR-010/FR-011).
    return QuestionResponse(id=str(uuid4()), text=payload.text)
