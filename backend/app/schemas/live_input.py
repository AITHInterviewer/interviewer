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
    role: str = "assessment"
    # "voice" | "code_review_verbal" | "live_coding" — см. app/models/question.py::Question.format.
    # live-agent переключает граф в фазу решения задачи для "live_coding".
    format: str = "voice"
    # Только для format="live_coding" — {"language": "..."} | None (язык не задан явно).
    stimulus: dict | None = None
    estimated_duration_sec: int = 180
    stt_terms: list[str] = Field(default_factory=list)


class LiveInputResponse(BaseModel):
    interview_id: str
    vacancy: LiveInputVacancy
    candidate: LiveInputCandidate
    questions: list[LiveInputQuestion]
