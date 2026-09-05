"""Сервис подготовки входных данных для evaluation-agent и сохранения результата."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.evaluation import Evaluation
from app.models.interview import Interview
from app.models.interview_event import InterviewEvent
from app.models.question import Question
from app.models.vacancy import Vacancy
from app.schemas.evaluation import (
    AnswerForEvaluationResponse,
    EvaluationCreateRequest,
    EvaluationInputResponse,
    EvaluationResponse,
    QuestionForEvaluationResponse,
    VacancyContextResponse,
)


class EvaluationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_interview(self, interview_id: UUID) -> Interview | None:
        result = await self.session.execute(select(Interview).where(Interview.id == interview_id))
        return result.scalar_one_or_none()

    async def build_evaluation_input(self, interview_id: UUID) -> EvaluationInputResponse:
        interview = await self.get_interview(interview_id)
        if interview is None:
            raise ValueError("Interview not found")

        vacancy_result = await self.session.execute(select(Vacancy).where(Vacancy.id == interview.vacancy_id))
        vacancy = vacancy_result.scalar_one()

        questions_result = await self.session.execute(
            select(Question)
            .where(
                Question.role == "assessment",
                (Question.vacancy_id == vacancy.id) | (Question.interview_id == interview_id),
            )
            .order_by(Question.order)
        )
        questions = questions_result.scalars().all()

        answers_result = await self.session.execute(select(Answer).where(Answer.interview_id == interview_id))
        answer_by_question = {answer.question_id: answer for answer in answers_result.scalars().all()}

        events_result = await self.session.execute(
            select(InterviewEvent)
            .where(InterviewEvent.interview_id == interview_id)
            .order_by(InterviewEvent.created_at.asc())
        )
        events = events_result.scalars().all()

        question_responses: list[QuestionForEvaluationResponse] = []
        for question in questions:
            answer = answer_by_question.get(question.id)
            answer_response = None
            if answer is not None:
                answer_response = AnswerForEvaluationResponse(
                    transcript_text=answer.transcript_text,
                    code_submission=answer.code_submission,
                    code_language=answer.code_language,
                    code_snapshots=answer.code_snapshots or [],
                    started_at=answer.started_at,
                    completed_at=answer.completed_at,
                )
            question_responses.append(
                QuestionForEvaluationResponse(
                    question_id=question.id,
                    text=question.text,
                    skill_tag=list(question.skill_tag or []),
                    intent=question.intent,
                    reference_answer=question.reference_answer,
                    difficulty=question.difficulty,
                    format=question.format,
                    role=question.role,
                    dynamic_trigger=question.dynamic_trigger,
                    source=question.source,
                    answer=answer_response,
                    answered_with_hint=question.dynamic_trigger == "leading_hint",
                )
            )

        return EvaluationInputResponse(
            interview=interview,
            vacancy=VacancyContextResponse(
                title=vacancy.title,
                description=vacancy.description,
                grade=vacancy.grade,
                required_skills=list(vacancy.required_skills or []),
                nice_to_have_skills=list(vacancy.nice_to_have_skills or []),
            ),
            questions=question_responses,
            events=events,
        )

    async def create_evaluation(
        self,
        interview_id: UUID,
        request: EvaluationCreateRequest,
    ) -> EvaluationResponse:
        interview = await self.get_interview(interview_id)
        if interview is None:
            raise ValueError("Interview not found")

        evaluation = Evaluation(
            interview_id=interview_id,
            per_question=[item.model_dump(mode="json") for item in request.per_question],
            overall_score=request.overall_score,
            verdict=request.verdict,
            confirmed_skills=list(request.confirmed_skills),
            unconfirmed_skills=list(request.unconfirmed_skills),
            contradictions_found=[item.model_dump(mode="json") for item in request.contradictions_found],
            strengths=list(request.strengths),
            risks=list(request.risks),
            summary_intro=request.summary_intro,
            summary_conclusion=request.summary_conclusion,
            model_version=request.model_version,
            prompt_version=request.prompt_version,
            generated_at=request.generated_at,
        )
        self.session.add(evaluation)

        await self.session.commit()
        await self.session.refresh(evaluation)
        return EvaluationResponse.model_validate(evaluation)

    async def mark_processing_failed(self, interview_id: UUID) -> None:
        interview = await self.get_interview(interview_id)
        if interview is not None:
            interview.status = "processing_failed"
            await self.session.commit()

    async def get_evaluation(self, interview_id: UUID) -> Evaluation | None:
        result = await self.session.execute(
            select(Evaluation).where(Evaluation.interview_id == interview_id)
        )
        return result.scalar_one_or_none()
