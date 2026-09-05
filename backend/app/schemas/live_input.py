"""Ответ `GET /api/v1/interviews/{interview_id}/live-input` — форма `InterviewInput` из
`live-agent/src/ainterviewer/schema.py` (план `kind-fluttering-reef.md`, раздел 3): поля
собираются здесь напрямую из Postgres-моделей, own `live-agent` их не хранит.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class LiveInputVacancy(BaseModel):
    title: str
    grade: str
    description: str
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)


class LiveInputCandidate(BaseModel):
    name: str
    resume_text: str = ""


class LiveInputQuestion(BaseModel):
    id: str
    text: str
    skill_tag: list[str] = Field(default_factory=list)
    intent: str
    reference_answer: str
    rubric_notes: str = ""
    difficulty: str


class LiveInputResponse(BaseModel):
    interview_id: str
    vacancy: LiveInputVacancy
    candidate: LiveInputCandidate
    questions: list[LiveInputQuestion]
