"""Бизнес-правила вакансии: переходы статуса (`draft → pending_review → ready`),
инвариант approve-времени (`role=assessment` ⇒ непустые `intent`/`reference_answer`/
`skill_tag`) и блокировка правок после `ready` (contracts/api.md).
"""

from __future__ import annotations

from uuid import UUID

from app.models.question import Question
from app.models.vacancy import Vacancy
from app.repositories.question_repository import QuestionRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.services.vacancy_llm_service import VacancyLLMService


class VacancyNotFoundError(Exception):
    pass


class QuestionNotFoundError(Exception):
    pass


class VacancyLockedError(Exception):
    """Вакансия уже `ready` — правки вакансии/вопросов/регенерация заблокированы (409)."""


class InvalidQuestionError(Exception):
    """`role=assessment`, но `intent`/`reference_answer`/`skill_tag` очищены (422)."""


class VacancyNotReadyError(Exception):
    """Approve-инвариант нарушен — несёт id вопросов-нарушителей."""

    def __init__(self, question_ids: list[UUID]) -> None:
        self.question_ids = question_ids
        super().__init__(f"Vacancy has invalid assessment questions: {question_ids}")


def _assessment_fields_valid(*, role: str, intent: str | None, reference_answer: str | None,
                              skill_tag: list[str] | None) -> bool:
    if role != "assessment":
        return True
    return bool(intent) and bool(reference_answer) and bool(skill_tag)


class VacancyService:
    def __init__(
        self,
        vacancy_repository: VacancyRepository,
        question_repository: QuestionRepository,
        llm_service: VacancyLLMService | None = None,
    ) -> None:
        self.vacancy_repository = vacancy_repository
        self.question_repository = question_repository
        self.llm_service = llm_service or VacancyLLMService()

    async def create_vacancy(
        self,
        *,
        recruiter_id: UUID,
        title: str,
        description: str,
        grade: str,
        required_skills: list[str],
        nice_to_have_skills: list[str],
    ) -> Vacancy:
        vacancy = Vacancy(
            recruiter_id=recruiter_id,
            title=title,
            description=description,
            grade=grade,
            required_skills=list(required_skills),
            nice_to_have_skills=list(nice_to_have_skills),
        )
        await self.vacancy_repository.create(vacancy)
        await self.vacancy_repository.commit()
        return vacancy

    async def get_vacancy(self, vacancy_id: UUID) -> Vacancy:
        vacancy = await self.vacancy_repository.get_by_id(vacancy_id)
        if vacancy is None:
            raise VacancyNotFoundError
        return vacancy

    async def list_vacancies(self) -> list[Vacancy]:
        return await self.vacancy_repository.list_all()

    async def list_questions(self, vacancy_id: UUID) -> list[Question]:
        return await self.question_repository.list_for_vacancy(vacancy_id)

    async def update_vacancy(
        self,
        vacancy_id: UUID,
        *,
        title: str | None = None,
        description: str | None = None,
        grade: str | None = None,
        required_skills: list[str] | None = None,
        nice_to_have_skills: list[str] | None = None,
    ) -> Vacancy:
        vacancy = await self.get_vacancy(vacancy_id)
        self._ensure_unlocked(vacancy)

        if title is not None:
            vacancy.title = title
        if description is not None:
            vacancy.description = description
        if grade is not None:
            vacancy.grade = grade
        if required_skills is not None:
            vacancy.required_skills = list(required_skills)
        if nice_to_have_skills is not None:
            vacancy.nice_to_have_skills = list(nice_to_have_skills)

        await self.vacancy_repository.commit()
        return vacancy

    async def generate_questions(self, vacancy_id: UUID) -> list[Question]:
        vacancy = await self.get_vacancy(vacancy_id)
        self._ensure_unlocked(vacancy)

        generated = await self.llm_service.generate_questions(vacancy)

        await self.question_repository.delete_generated_for_vacancy(vacancy_id)
        existing = await self.question_repository.list_for_vacancy(vacancy_id)
        next_order = (max((q.order for q in existing), default=-1)) + 1

        created: list[Question] = []
        for offset, item in enumerate(generated.questions):
            question = Question(
                vacancy_id=vacancy_id,
                text=item.text,
                order=next_order + offset,
                skill_tag=list(item.skill_tag),
                intent=item.intent,
                reference_answer=item.reference_answer,
                format=item.format,
                role=item.role,
                difficulty=item.difficulty,
                estimated_duration_sec=item.estimated_duration_sec,
                source="base_generated",
            )
            await self.question_repository.create(question)
            created.append(question)

        vacancy.status = "pending_review"
        await self.vacancy_repository.commit()
        return created

    async def add_question(
        self,
        vacancy_id: UUID,
        *,
        text: str,
        order: int | None = None,
        skill_tag: list[str] | None = None,
        intent: str | None = None,
        reference_answer: str | None = None,
        format: str = "voice",
        role: str = "assessment",
        difficulty: str = "baseline",
        estimated_duration_sec: int = 180,
    ) -> Question:
        vacancy = await self.get_vacancy(vacancy_id)
        self._ensure_unlocked(vacancy)

        # contracts/api.md: adding a manual question only requires `text` — `skill_tag`/
        # `intent`/`reference_answer` are optional at this point (client may fill them in
        # later via a separate edit); the invariant is enforced at `update_question`/
        # `approve_vacancy` time instead.
        skill_tag = list(skill_tag or [])

        if order is None:
            existing = await self.question_repository.list_for_vacancy(vacancy_id)
            order = (max((q.order for q in existing), default=-1)) + 1

        question = Question(
            vacancy_id=vacancy_id,
            text=text,
            order=order,
            skill_tag=skill_tag,
            intent=intent,
            reference_answer=reference_answer,
            format=format,
            role=role,
            difficulty=difficulty,
            estimated_duration_sec=estimated_duration_sec,
            source="base_manual",
        )
        await self.question_repository.create(question)
        await self.question_repository.commit()
        return question

    async def update_question(
        self,
        vacancy_id: UUID,
        question_id: UUID,
        changes: dict[str, object],
    ) -> Question:
        """`changes` — только явно переданные поля (`model_dump(exclude_unset=True)` на
        уровне роутера), а не все поля схемы: значение `None` здесь означает явную очистку
        (напр. `intent=None`), а не «поле не менялось» — иначе нельзя проверить инвариант
        «role=assessment, но intent/reference_answer очищены» (contracts/api.md)."""
        vacancy = await self.get_vacancy(vacancy_id)
        self._ensure_unlocked(vacancy)

        question = await self.question_repository.get_by_id(question_id)
        if question is None or question.vacancy_id != vacancy_id:
            raise QuestionNotFoundError

        for field, value in changes.items():
            setattr(question, field, value)

        if not _assessment_fields_valid(
            role=question.role,
            intent=question.intent,
            reference_answer=question.reference_answer,
            skill_tag=question.skill_tag,
        ):
            raise InvalidQuestionError

        if question.source == "base_generated":
            question.source = "base_edited"

        await self.question_repository.commit()
        return question

    async def delete_question(self, vacancy_id: UUID, question_id: UUID) -> None:
        vacancy = await self.get_vacancy(vacancy_id)
        self._ensure_unlocked(vacancy)

        question = await self.question_repository.get_by_id(question_id)
        if question is None or question.vacancy_id != vacancy_id:
            raise QuestionNotFoundError

        await self.question_repository.delete(question)
        await self.question_repository.commit()

    async def approve_vacancy(self, vacancy_id: UUID) -> Vacancy:
        vacancy = await self.get_vacancy(vacancy_id)
        self._ensure_unlocked(vacancy)

        questions = await self.question_repository.list_for_vacancy(vacancy_id)
        offending = [
            q.id
            for q in questions
            if not _assessment_fields_valid(
                role=q.role, intent=q.intent, reference_answer=q.reference_answer, skill_tag=q.skill_tag
            )
        ]
        if not questions or offending:
            raise VacancyNotReadyError(offending)

        vacancy.status = "ready"
        await self.vacancy_repository.commit()
        return vacancy

    @staticmethod
    def _ensure_unlocked(vacancy: Vacancy) -> None:
        if vacancy.status == "ready":
            raise VacancyLockedError
