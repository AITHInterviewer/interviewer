from datetime import UTC, datetime
from uuid import UUID

from app.models.user import InternalUser
from app.models.vacancy import Vacancy
from app.models.vacancy_question import VacancyQuestion
from app.models.vacancy_review_decision import VacancyReviewDecision
from app.repositories.user_repository import UserRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.schemas.vacancies import (
    QuestionCreateRequest,
    QuestionUpdateRequest,
    ReviewStateResponse,
    VacancyCreateRequest,
    VacancyDetailResponse,
    VacancyListResponse,
    VacancyQuestionResponse,
    VacancySummaryResponse,
)

REVIEWABLE_STATUS = "submitted_for_review"
ARCHIVED_STATUS = "archived"
APPROVED_STATUS = "approved"
CHANGES_REQUESTED_STATUS = "changes_requested"
DRAFT_STATUS = "draft"

RECRUITER_EDIT_PERMISSIONS = [
    "vacancy.body.edit",
    "vacancy.questions.edit",
    "vacancy.review_history.view",
]
EXPERT_REVIEW_PERMISSIONS = [
    "vacancy.questions.edit",
    "vacancy.review_history.view",
]


class VacancyNotFoundError(Exception):
    pass


class VacancyAccessError(Exception):
    pass


class VacancyConflictError(Exception):
    pass


class VacancyStateError(Exception):
    pass


class QuestionNotFoundError(Exception):
    pass


def utcnow() -> datetime:
    return datetime.now(UTC)


class VacancyService:
    def __init__(self, vacancy_repository: VacancyRepository, user_repository: UserRepository) -> None:
        self.vacancy_repository = vacancy_repository
        self.user_repository = user_repository

    def resolve_managing_recruiter_id(self, actor: InternalUser) -> UUID:
        return actor.created_by_user_id or actor.id

    def _normalize_strings(self, values: list[str] | None) -> list[str]:
        if not values:
            return []
        return [value.strip() for value in values if value.strip()]

    async def create_vacancy(
        self, actor: InternalUser, payload: VacancyCreateRequest
    ) -> VacancyDetailResponse:
        managing_recruiter_id = self.resolve_managing_recruiter_id(actor)
        vacancy = Vacancy(
            title=payload.title,
            grade=payload.grade,
            job_description=payload.job_description,
            ideal_candidate_profile=payload.ideal_candidate_profile,
            required_skills=self._normalize_strings(payload.required_skills),
            nice_to_have_skills=self._normalize_strings(payload.nice_to_have_skills),
            interview_time_limit_minutes=payload.interview_time_limit_minutes,
            status=DRAFT_STATUS,
            created_by_recruiter_id=managing_recruiter_id,
            created_by_user_id=actor.id,
            managing_recruiter_id=managing_recruiter_id,
            updated_at=utcnow(),
        )
        created = await self.vacancy_repository.create_vacancy(vacancy)
        await self.vacancy_repository.commit()
        return self.serialize_detail(created, viewer="recruiter")

    async def list_recruiter_vacancies(
        self, actor: InternalUser, status: str | None = None
    ) -> VacancyListResponse:
        items = await self.vacancy_repository.list_recruiter_vacancies(actor.id, status=status)
        return VacancyListResponse(items=[self.serialize_summary(item) for item in items])

    async def get_recruiter_vacancy(self, actor: InternalUser, vacancy_id: UUID) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        return self.serialize_detail(vacancy, viewer="recruiter")

    async def update_vacancy(
        self,
        actor: InternalUser,
        vacancy_id: UUID,
        *,
        title: str | None = None,
        grade: str | None = None,
        job_description: str | None = None,
        ideal_candidate_profile: str | None = None,
        required_skills: list[str] | None = None,
        nice_to_have_skills: list[str] | None = None,
        interview_time_limit_minutes: int | None = None,
        interview_time_limit_provided: bool = False,
        expected_updated_at: datetime,
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        self.ensure_not_archived(vacancy)
        self.ensure_fresh(vacancy, expected_updated_at)

        significant_changed = False
        for attr, value in {
            "title": title,
            "grade": grade,
            "job_description": job_description,
            "ideal_candidate_profile": ideal_candidate_profile,
        }.items():
            if value is not None and getattr(vacancy, attr) != value:
                setattr(vacancy, attr, value)
                significant_changed = True

        if required_skills is not None:
            normalized = self._normalize_strings(required_skills)
            if vacancy.required_skills != normalized:
                vacancy.required_skills = normalized
                significant_changed = True
        if nice_to_have_skills is not None:
            normalized = self._normalize_strings(nice_to_have_skills)
            if vacancy.nice_to_have_skills != normalized:
                vacancy.nice_to_have_skills = normalized
                significant_changed = True

        if interview_time_limit_provided and (
            vacancy.interview_time_limit_minutes != interview_time_limit_minutes
        ):
            vacancy.interview_time_limit_minutes = interview_time_limit_minutes
            significant_changed = True

        self.apply_recruiter_mutation_side_effects(
            vacancy, significant_changed=significant_changed
        )
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer="recruiter")

    async def create_question(
        self, actor: InternalUser, vacancy_id: UUID, payload: QuestionCreateRequest
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        self.ensure_not_archived(vacancy)
        self.ensure_fresh(vacancy, payload.expected_updated_at)
        question = VacancyQuestion(
            vacancy_id=vacancy.id,
            text=payload.text,
            order=self._resolve_question_order(vacancy, payload.order),
            skill_tags=self._normalize_strings(payload.skill_tags) or None,
            intent=payload.intent,
            reference_answer=payload.reference_answer,
            format=payload.format or "voice",
            role=payload.role or "assessment",
            difficulty=payload.difficulty or "baseline",
            estimated_duration_sec=payload.estimated_duration_sec,
            stimulus=payload.stimulus,
            source=payload.source or "base_manual",
            updated_at=utcnow(),
        )
        vacancy.questions.append(question)
        await self.vacancy_repository.add_question(question)
        self._renumber_questions(vacancy)
        self.apply_recruiter_mutation_side_effects(vacancy, significant_changed=True)
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer="recruiter")

    async def update_question(
        self,
        actor: InternalUser,
        vacancy_id: UUID,
        question_id: UUID,
        payload: QuestionUpdateRequest,
        *,
        viewer: str = "recruiter",
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        if viewer == "recruiter":
            self.ensure_recruiter_control(actor, vacancy)
            self.ensure_not_archived(vacancy)
        self.ensure_fresh(vacancy, payload.expected_updated_at)
        question = self._find_question(vacancy, question_id)
        significant_changed = False

        if payload.text is not None and question.text != payload.text:
            question.text = payload.text
            significant_changed = True
        if payload.order is not None and question.order != payload.order:
            question.order = payload.order
            significant_changed = True

        question_fields = [
            "intent",
            "reference_answer",
            "format",
            "role",
            "difficulty",
            "estimated_duration_sec",
            "stimulus",
            "source",
        ]
        for attr in question_fields:
            value = getattr(payload, attr)
            if value is not None and getattr(question, attr) != value:
                setattr(question, attr, value)
                significant_changed = True

        if payload.skill_tags is not None:
            normalized = self._normalize_strings(payload.skill_tags) or None
            if question.skill_tags != normalized:
                question.skill_tags = normalized
                significant_changed = True

        self._renumber_questions(vacancy)
        question.updated_at = utcnow()
        vacancy.updated_at = utcnow()
        if viewer == "recruiter":
            self.apply_recruiter_mutation_side_effects(
                vacancy, significant_changed=significant_changed
            )
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer=viewer)

    async def delete_question(
        self,
        actor: InternalUser,
        vacancy_id: UUID,
        question_id: UUID,
        expected_updated_at: datetime,
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        self.ensure_not_archived(vacancy)
        self.ensure_fresh(vacancy, expected_updated_at)
        question = self._find_question(vacancy, question_id)
        vacancy.questions.remove(question)
        await self.vacancy_repository.delete_question(question)
        self._renumber_questions(vacancy)
        self.apply_recruiter_mutation_side_effects(vacancy, significant_changed=True)
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer="recruiter")

    async def submit_for_review(
        self, actor: InternalUser, vacancy_id: UUID, expected_updated_at: datetime
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        self.ensure_not_archived(vacancy)
        self.ensure_fresh(vacancy, expected_updated_at)
        if vacancy.status not in {DRAFT_STATUS, CHANGES_REQUESTED_STATUS}:
            raise VacancyStateError(
                "Vacancy cannot be submitted for review in its current state."
            )
        vacancy.status = REVIEWABLE_STATUS
        vacancy.submitted_at = utcnow()
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer="recruiter")

    async def archive(
        self, actor: InternalUser, vacancy_id: UUID, expected_updated_at: datetime
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        self.ensure_fresh(vacancy, expected_updated_at)
        if vacancy.status == ARCHIVED_STATUS:
            raise VacancyStateError("Vacancy is already archived.")
        vacancy.status_before_archive = vacancy.status
        vacancy.status = ARCHIVED_STATUS
        vacancy.archived_at = utcnow()
        vacancy.archived_by_user_id = actor.id
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer="recruiter")

    async def restore(
        self, actor: InternalUser, vacancy_id: UUID, expected_updated_at: datetime
    ) -> VacancyDetailResponse:
        vacancy = await self._get_vacancy_or_raise(vacancy_id)
        self.ensure_recruiter_control(actor, vacancy)
        self.ensure_fresh(vacancy, expected_updated_at)
        if vacancy.status != ARCHIVED_STATUS:
            raise VacancyStateError("Vacancy is not archived.")
        vacancy.status = vacancy.status_before_archive or DRAFT_STATUS
        vacancy.archived_at = None
        vacancy.archived_by_user_id = None
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self._get_vacancy_or_raise(vacancy.id)
        return self.serialize_detail(refreshed, viewer="recruiter")

    def ensure_recruiter_control(self, actor: InternalUser, vacancy: Vacancy) -> None:
        if actor.id not in {vacancy.created_by_user_id, vacancy.managing_recruiter_id}:
            raise VacancyAccessError("You do not have access to this vacancy.")

    def ensure_fresh(self, vacancy: Vacancy, expected_updated_at: datetime) -> None:
        if not self.vacancy_repository.updated_at_matches(vacancy.updated_at, expected_updated_at):
            raise VacancyConflictError(
                "Vacancy changed since you last loaded it. Refresh and try again."
            )

    def ensure_not_archived(self, vacancy: Vacancy) -> None:
        if vacancy.status == ARCHIVED_STATUS:
            raise VacancyStateError("Archived vacancies must be restored before editing.")

    def apply_recruiter_mutation_side_effects(
        self, vacancy: Vacancy, *, significant_changed: bool
    ) -> None:
        if vacancy.status == CHANGES_REQUESTED_STATUS:
            vacancy.status = DRAFT_STATUS
        if vacancy.status == APPROVED_STATUS and significant_changed:
            vacancy.status = DRAFT_STATUS
            vacancy.approved_at = None
            vacancy.approved_by_user_id = None

    async def _get_vacancy_or_raise(self, vacancy_id: UUID) -> Vacancy:
        vacancy = await self.vacancy_repository.get_vacancy(vacancy_id)
        if vacancy is None:
            raise VacancyNotFoundError
        return vacancy

    def _find_question(self, vacancy: Vacancy, question_id: UUID) -> VacancyQuestion:
        for question in vacancy.questions:
            if question.id == question_id:
                return question
        raise QuestionNotFoundError

    def _resolve_question_order(self, vacancy: Vacancy, requested_order: int | None) -> int:
        if requested_order is None or requested_order < 0:
            return len(vacancy.questions)
        return min(requested_order, len(vacancy.questions))

    def _renumber_questions(self, vacancy: Vacancy) -> None:
        ordered_questions = sorted(
            vacancy.questions, key=lambda item: (item.order, item.created_at)
        )
        for index, question in enumerate(ordered_questions):
            question.order = index

    def serialize_summary(self, vacancy: Vacancy) -> VacancySummaryResponse:
        latest_decision = vacancy.review_decisions[-1] if vacancy.review_decisions else None
        return VacancySummaryResponse(
            id=str(vacancy.id),
            title=vacancy.title,
            grade=vacancy.grade,
            status=vacancy.status,
            question_count=len(vacancy.questions),
            interview_time_limit_minutes=vacancy.interview_time_limit_minutes,
            updated_at=vacancy.updated_at,
            submitted_at=vacancy.submitted_at,
            approved_at=vacancy.approved_at,
            latest_review_decision=latest_decision.decision if latest_decision else None,
        )

    def serialize_detail(self, vacancy: Vacancy, *, viewer: str) -> VacancyDetailResponse:
        latest_decision = vacancy.review_decisions[-1] if vacancy.review_decisions else None
        questions = [
            VacancyQuestionResponse(
                id=str(question.id),
                text=question.text,
                order=question.order,
                skill_tags=question.skill_tags,
                intent=question.intent,
                reference_answer=question.reference_answer,
                format=question.format,
                role=question.role,
                difficulty=question.difficulty,
                estimated_duration_sec=question.estimated_duration_sec,
                stimulus=question.stimulus,
                source=question.source,
                updated_at=question.updated_at,
            )
            for question in sorted(
                vacancy.questions, key=lambda item: (item.order, item.created_at)
            )
        ]
        permissions = self.viewer_permissions(vacancy, viewer=viewer)
        review_state = ReviewStateResponse(
            status=vacancy.status,
            latest_review_decision=latest_decision.decision if latest_decision else None,
            latest_review_comment=latest_decision.comment if latest_decision else None,
            latest_reviewed_at=latest_decision.created_at if latest_decision else None,
            submitted_at=vacancy.submitted_at,
            approved_at=vacancy.approved_at,
            approved_by_user_id=(
                str(vacancy.approved_by_user_id)
                if vacancy.approved_by_user_id
                else None
            ),
            archived_at=vacancy.archived_at,
            archived_by_user_id=str(vacancy.archived_by_user_id) if vacancy.archived_by_user_id else None,
        )
        return VacancyDetailResponse(
            id=str(vacancy.id),
            title=vacancy.title,
            grade=vacancy.grade,
            job_description=vacancy.job_description,
            ideal_candidate_profile=vacancy.ideal_candidate_profile,
            required_skills=vacancy.required_skills or [],
            nice_to_have_skills=vacancy.nice_to_have_skills or [],
            status=vacancy.status,
            created_by_recruiter_id=str(vacancy.created_by_recruiter_id),
            created_by_user_id=str(vacancy.created_by_user_id),
            managing_recruiter_id=str(vacancy.managing_recruiter_id),
            interview_time_limit_minutes=vacancy.interview_time_limit_minutes,
            created_at=vacancy.created_at,
            updated_at=vacancy.updated_at,
            questions=questions,
            review_state=review_state,
            viewer_permissions=permissions,
        )

    def viewer_permissions(self, vacancy: Vacancy, *, viewer: str) -> list[str]:
        permissions: list[str] = ["vacancy.review_history.view"]
        if viewer == "recruiter":
            permissions.append("vacancy.links.view")
            if vacancy.status == ARCHIVED_STATUS:
                permissions.append("vacancy.restore")
                return list(dict.fromkeys(permissions))
            permissions.append("vacancy.links.manage")
            permissions.extend(RECRUITER_EDIT_PERMISSIONS[:2])
            if vacancy.status in {DRAFT_STATUS, CHANGES_REQUESTED_STATUS}:
                permissions.append("vacancy.submit")
            permissions.append("vacancy.archive")
            return list(dict.fromkeys(permissions))

        if viewer == "expert":
            permissions.append("vacancy.links.view")
            if vacancy.status == REVIEWABLE_STATUS:
                permissions.extend(EXPERT_REVIEW_PERMISSIONS[:1])
                permissions.extend(["vacancy.approve", "vacancy.request_changes"])
        return list(dict.fromkeys(permissions))


class VacancyReviewService:
    def __init__(self, vacancy_repository: VacancyRepository, vacancy_service: VacancyService) -> None:
        self.vacancy_repository = vacancy_repository
        self.vacancy_service = vacancy_service

    async def list_queue(self) -> VacancyListResponse:
        items = await self.vacancy_repository.list_expert_queue()
        return VacancyListResponse(
            items=[self.vacancy_service.serialize_summary(item) for item in items]
        )

    async def get_review_vacancy(self, vacancy_id: UUID) -> VacancyDetailResponse:
        vacancy = await self.vacancy_service._get_vacancy_or_raise(vacancy_id)
        if vacancy.status != REVIEWABLE_STATUS:
            raise VacancyAccessError("Vacancy is not available for expert review.")
        return self.vacancy_service.serialize_detail(vacancy, viewer="expert")

    async def update_question(
        self,
        actor: InternalUser,
        vacancy_id: UUID,
        question_id: UUID,
        payload: QuestionUpdateRequest,
    ) -> VacancyDetailResponse:
        vacancy = await self.vacancy_service._get_vacancy_or_raise(vacancy_id)
        if vacancy.status != REVIEWABLE_STATUS:
            raise VacancyAccessError("Vacancy is not available for expert editing.")
        return await self.vacancy_service.update_question(
            actor, vacancy_id, question_id, payload, viewer="expert"
        )

    async def approve(
        self,
        actor: InternalUser,
        vacancy_id: UUID,
        expected_updated_at: datetime,
        comment: str = "",
    ) -> VacancyDetailResponse:
        return await self._decide(
            actor,
            vacancy_id,
            expected_updated_at=expected_updated_at,
            decision=APPROVED_STATUS,
            comment=comment,
        )

    async def request_changes(
        self, actor: InternalUser, vacancy_id: UUID, expected_updated_at: datetime, comment: str = ""
    ) -> VacancyDetailResponse:
        return await self._decide(
            actor,
            vacancy_id,
            expected_updated_at=expected_updated_at,
            decision=CHANGES_REQUESTED_STATUS,
            comment=comment,
        )

    async def _decide(
        self,
        actor: InternalUser,
        vacancy_id: UUID,
        *,
        expected_updated_at: datetime,
        decision: str,
        comment: str,
    ) -> VacancyDetailResponse:
        vacancy = await self.vacancy_service._get_vacancy_or_raise(vacancy_id)
        if vacancy.status != REVIEWABLE_STATUS:
            raise VacancyAccessError("Vacancy is not available for expert review.")
        self.vacancy_service.ensure_fresh(vacancy, expected_updated_at)
        decision_record = VacancyReviewDecision(
            vacancy_id=vacancy.id,
            expert_user_id=actor.id,
            decision=decision,
            comment=comment,
        )
        vacancy.review_decisions.append(decision_record)
        await self.vacancy_repository.add_review_decision(decision_record)
        if decision == APPROVED_STATUS:
            vacancy.status = APPROVED_STATUS
            vacancy.approved_at = utcnow()
            vacancy.approved_by_user_id = actor.id
        else:
            vacancy.status = CHANGES_REQUESTED_STATUS
        vacancy.updated_at = utcnow()
        await self.vacancy_repository.commit()
        refreshed = await self.vacancy_service._get_vacancy_or_raise(vacancy.id)
        return self.vacancy_service.serialize_detail(refreshed, viewer="expert")
