"""specs/003-recruiter-vacancy-management/contracts/api.md — вакансии/вопросы/интервью.

Роли (план `kind-fluttering-reef.md`): **recruiter** (`area.recruiter_workspace`) пишет
вакансию, генерирует вопросы, создаёт интервью; **expert** (`action.questions.edit`)
правит/добавляет/удаляет вопросы и утверждает вакансию; чтение (`GET`) доступно любой из
этих ролей.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.dependencies.auth import (
    get_granted_capabilities,
    require_any_capability,
    require_capability,
)
from app.models.user import InternalUser
from app.repositories.question_repository import QuestionRepository
from app.repositories.vacancy_repository import VacancyRepository
from app.roles.catalog import (
    ACTION_QUESTIONS_EDIT,
    AREA_EXPERT_QUESTIONS,
    AREA_HIRING_MANAGER_REVIEW,
    AREA_RECRUITER_WORKSPACE,
)
from app.schemas.interview import CreateInterviewResponse, InterviewListResponse, InterviewResponse
from app.schemas.vacancy import (
    ChangeRequestBody,
    ExtractRequirementsResponse,
    GenerateQuestionsResponse,
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
    RequirementsUpdate,
    VacancyCreate,
    VacancyListResponse,
    VacancyResponse,
    VacancyUpdate,
)
from app.services.document_text import (
    DocumentTooLargeError,
    EmptyDocumentError,
    UnreadableDocumentError,
    UnsupportedDocumentError,
    extract_pdf_text,
)
from app.services.interview_admin_service import InterviewAdminService, VacancyNotReadyForInterviewError
from app.services.vacancy_llm_service import QuestionGenerationError, RequirementExtractionError
from app.services.vacancy_service import (
    MAX_REQUIREMENTS,
    InvalidQuestionError,
    QuestionNotFoundError,
    RequirementCoverageError,
    RequirementsNotYoursError,
    VacancyLockedError,
    VacancyMissingQuestionsError,
    VacancyMissingRequirementsError,
    VacancyNotFoundError,
    VacancyNotReadyError,
    VacancyService,
    VacancyTransitionError,
)

router = APIRouter(prefix="/api/v1/vacancies", tags=["vacancies"])

require_recruiter = require_capability(AREA_RECRUITER_WORKSPACE)
require_expert = require_capability(ACTION_QUESTIONS_EDIT)
require_reader = require_any_capability(AREA_RECRUITER_WORKSPACE, AREA_EXPERT_QUESTIONS)
require_brief = require_any_capability(
    AREA_RECRUITER_WORKSPACE, AREA_EXPERT_QUESTIONS, AREA_HIRING_MANAGER_REVIEW
)


def get_vacancy_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> VacancyService:
    return VacancyService(VacancyRepository(session), QuestionRepository(session))


def get_interview_admin_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InterviewAdminService:
    return InterviewAdminService(session)


async def _vacancy_response(service: VacancyService, vacancy) -> VacancyResponse:
    questions = await service.list_questions(vacancy.id)
    return VacancyResponse.from_model(vacancy, questions)


@router.post("", response_model=VacancyResponse, status_code=status.HTTP_201_CREATED)
async def create_vacancy(
    payload: VacancyCreate,
    actor: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    vacancy = await service.create_vacancy(
        recruiter_id=actor.id,
        title=payload.title,
        description=payload.description,
        grade=payload.grade,
        required_skills=payload.required_skills,
        nice_to_have_skills=payload.nice_to_have_skills,
        requirements=[item.model_dump() for item in payload.requirements],
        description_source=payload.description_source,
        description_file_name=payload.description_file_name,
        expert_id=payload.expert_id,
        hiring_manager_id=payload.hiring_manager_id,
    )
    return await _vacancy_response(service, vacancy)


# Путь без `{vacancy_id}` намеренно: разбор описания идёт ДО создания вакансии, иначе
# каждое нажатие «Извлечь требования» плодило бы черновики.
@router.post("/extract-requirements", response_model=ExtractRequirementsResponse)
async def extract_requirements(
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
    description: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> ExtractRequirementsResponse:
    file_name: str | None = None
    if file is not None:
        try:
            text = extract_pdf_text(await file.read())
        except DocumentTooLargeError as exc:
            raise HTTPException(status_code=413, detail="file_too_large") from exc
        except UnsupportedDocumentError as exc:
            raise HTTPException(status_code=415, detail="not_a_pdf") from exc
        except EmptyDocumentError as exc:
            raise HTTPException(status_code=422, detail="pdf_no_text_layer") from exc
        except UnreadableDocumentError as exc:
            raise HTTPException(status_code=422, detail="pdf_unreadable") from exc
        file_name = file.filename
    elif description and description.strip():
        text = description.strip()
    else:
        raise HTTPException(status_code=422, detail="empty_description")

    try:
        extracted = await service.llm_service.extract_requirements(text)
    except RequirementExtractionError as exc:
        raise HTTPException(status_code=502, detail="extraction_failed") from exc

    return ExtractRequirementsResponse(
        title=extracted.title,
        grade=extracted.grade,
        description=text,
        description_file_name=file_name,
        # Потолок держим и здесь: промпт просит не больше MAX_REQUIREMENTS, но модель
        # эту просьбу регулярно игнорирует, а каждое лишнее требование — лишний вопрос
        # в интервью. Срез — по порядку от модели, она ранжирует по важности сама.
        requirements=[
            {**item.model_dump(), "id": f"req_{index}", "source": "llm"}
            for index, item in enumerate(extracted.requirements[:MAX_REQUIREMENTS])
        ],
        excluded=[item.model_dump() for item in extracted.excluded]
        + [
            {"text": item.name, "reason": "не помещается в одно интервью"}
            for item in extracted.requirements[MAX_REQUIREMENTS:]
        ],
        warnings=extracted.warnings,
    )


@router.get("", response_model=VacancyListResponse)
async def list_vacancies(
    _: Annotated[InternalUser, Depends(require_reader)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyListResponse:
    vacancies = await service.list_vacancies()
    items = [await _vacancy_response(service, vacancy) for vacancy in vacancies]
    return VacancyListResponse(items=items)


@router.get("/{vacancy_id}", response_model=VacancyResponse)
async def get_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_brief)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    return await _vacancy_response(service, vacancy)


@router.patch("/{vacancy_id}", response_model=VacancyResponse)
async def update_vacancy(
    vacancy_id: UUID,
    payload: VacancyUpdate,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.update_vacancy(vacancy_id, **payload.model_dump(exclude_unset=True))
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    return await _vacancy_response(service, vacancy)


# Требования правятся ТОЛЬКО здесь, не через общий PATCH: у них своё правило владения —
# до калибровки список у рекрутёра, на калибровке у эксперта (specs/010-vacancy-from-description).
@router.put("/{vacancy_id}/requirements", response_model=VacancyResponse)
async def set_requirements(
    vacancy_id: UUID,
    payload: RequirementsUpdate,
    _: Annotated[InternalUser, Depends(require_reader)],
    capabilities: Annotated[set[str], Depends(get_granted_capabilities)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.set_requirements(
            vacancy_id,
            [item.model_dump() for item in payload.requirements],
            is_recruiter=AREA_RECRUITER_WORKSPACE in capabilities,
            is_expert=ACTION_QUESTIONS_EDIT in capabilities,
        )
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except RequirementsNotYoursError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="requirements_not_yours") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="requirements_locked") from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/questions/generate", response_model=GenerateQuestionsResponse)
async def generate_questions(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> GenerateQuestionsResponse:
    try:
        questions = await service.generate_questions(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    return GenerateQuestionsResponse(questions=[QuestionResponse.model_validate(q) for q in questions])


@router.post(
    "/{vacancy_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED
)
async def add_question(
    vacancy_id: UUID,
    payload: QuestionCreate,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> QuestionResponse:
    try:
        question = await service.add_question(vacancy_id, **payload.model_dump())
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    except InvalidQuestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assessment questions require intent, reference_answer and skill_tag.",
        ) from exc
    return QuestionResponse.model_validate(question)


@router.post("/{vacancy_id}/questions/{question_id}/regenerate", response_model=QuestionResponse)
async def regenerate_question(
    vacancy_id: UUID,
    question_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> QuestionResponse:
    try:
        question = await service.regenerate_question(vacancy_id, question_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except QuestionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    return QuestionResponse.model_validate(question)


@router.patch("/{vacancy_id}/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    vacancy_id: UUID,
    question_id: UUID,
    payload: QuestionUpdate,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> QuestionResponse:
    try:
        question = await service.update_question(
            vacancy_id, question_id, payload.model_dump(exclude_unset=True)
        )
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except QuestionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc
    except InvalidQuestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assessment questions require intent, reference_answer and skill_tag.",
        ) from exc
    return QuestionResponse.model_validate(question)


@router.delete("/{vacancy_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    vacancy_id: UUID,
    question_id: UUID,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> None:
    try:
        await service.delete_question(vacancy_id, question_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except QuestionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is already ready.") from exc


@router.post("/{vacancy_id}/approve", response_model=VacancyResponse)
async def approve_vacancy(
    vacancy_id: UUID,
    actor: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.approve_vacancy(vacancy_id, approved_by_id=actor.id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    except VacancyLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is locked.") from exc
    except VacancyNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Vacancy has invalid assessment questions: {[str(qid) for qid in exc.question_ids]}",
        ) from exc
    except RequirementCoverageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"questions_missing_requirements: {', '.join(exc.missing)}",
        ) from exc
    except QuestionGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="question_generation_failed"
        ) from exc
    except VacancyTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Invalid vacancy transition."
        ) from exc
    return await _vacancy_response(service, vacancy)


_TRANSITION_ERRORS = (
    VacancyNotFoundError,
    VacancyTransitionError,
    VacancyLockedError,
    VacancyMissingQuestionsError,
    VacancyMissingRequirementsError,
)


def _transition_http(exc: Exception) -> HTTPException:
    if isinstance(exc, VacancyNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.")
    if isinstance(exc, VacancyTransitionError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invalid vacancy transition.")
    if isinstance(exc, VacancyLockedError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vacancy is locked.")
    if isinstance(exc, VacancyMissingQuestionsError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Vacancy has no questions yet.",
        )
    if isinstance(exc, VacancyMissingRequirementsError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="not_enough_requirements",
        )
    raise exc


@router.post("/{vacancy_id}/send-to-expert", response_model=VacancyResponse)
async def send_to_expert(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.send_to_expert(vacancy_id)
    except _TRANSITION_ERRORS as exc:
        raise _transition_http(exc) from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/request-changes", response_model=VacancyResponse)
async def request_changes(
    vacancy_id: UUID,
    payload: ChangeRequestBody,
    _: Annotated[InternalUser, Depends(require_expert)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.request_changes(vacancy_id, payload.reason)
    except _TRANSITION_ERRORS as exc:
        raise _transition_http(exc) from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/activate", response_model=VacancyResponse)
async def activate_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.activate(vacancy_id)
    except _TRANSITION_ERRORS as exc:
        raise _transition_http(exc) from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/pause", response_model=VacancyResponse)
async def pause_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.pause(vacancy_id)
    except _TRANSITION_ERRORS as exc:
        raise _transition_http(exc) from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/resume", response_model=VacancyResponse)
async def resume_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.resume(vacancy_id)
    except _TRANSITION_ERRORS as exc:
        raise _transition_http(exc) from exc
    return await _vacancy_response(service, vacancy)


@router.post("/{vacancy_id}/archive", response_model=VacancyResponse)
async def archive_vacancy(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> VacancyResponse:
    try:
        vacancy = await service.archive(vacancy_id)
    except _TRANSITION_ERRORS as exc:
        raise _transition_http(exc) from exc
    return await _vacancy_response(service, vacancy)


@router.get("/{vacancy_id}/rubric-versions")
async def list_rubric_versions(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_brief)],
    service: Annotated[VacancyService, Depends(get_vacancy_service)],
) -> dict:
    try:
        versions = await service.list_rubric_versions(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    return {
        "items": [
            {
                "id": str(item.id),
                "vacancy_id": str(item.vacancy_id),
                "version_number": item.version_number,
                "approved_at": item.approved_at.isoformat() if item.approved_at else None,
                "snapshot": item.snapshot,
            }
            for item in versions
        ]
    }


@router.get("/{vacancy_id}/anonymized-stats")
async def anonymized_stats(
    vacancy_id: UUID,
    _: Annotated[
        InternalUser,
        Depends(
            require_any_capability(
                AREA_RECRUITER_WORKSPACE, AREA_EXPERT_QUESTIONS, AREA_HIRING_MANAGER_REVIEW
            )
        ),
    ],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    interview_service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
) -> dict:
    try:
        await vacancy_service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc
    interviews = await interview_service.list_interviews(vacancy_id)
    invited_states = {"invited", "opened", "consented", "device_checked", "ready", "expired", "declined"}
    return {
        "invited": sum(1 for item in interviews if item.product_state in invited_states),
        "completed": sum(1 for item in interviews if item.status == "completed"),
        "awaiting_decision": sum(1 for item in interviews if item.recruiter_decision == "awaiting"),
    }


@router.post(
    "/{vacancy_id}/interviews",
    response_model=CreateInterviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_recruiter)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    interview_service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
    resume_file: Annotated[UploadFile, File()],
    candidate_name: Annotated[str | None, Form()] = None,
) -> CreateInterviewResponse:
    try:
        vacancy = await vacancy_service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc

    try:
        interview, candidate_link = await interview_service.create_interview(
            vacancy, resume_file, candidate_name
        )
    except VacancyNotReadyForInterviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Vacancy is not ready."
        ) from exc

    return CreateInterviewResponse(
        interview=InterviewResponse.model_validate(interview), candidate_link=candidate_link
    )


@router.get("/{vacancy_id}/interviews", response_model=InterviewListResponse)
async def list_interviews(
    vacancy_id: UUID,
    _: Annotated[InternalUser, Depends(require_reader)],
    vacancy_service: Annotated[VacancyService, Depends(get_vacancy_service)],
    interview_service: Annotated[InterviewAdminService, Depends(get_interview_admin_service)],
) -> InterviewListResponse:
    try:
        await vacancy_service.get_vacancy(vacancy_id)
    except VacancyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.") from exc

    interviews = await interview_service.list_interviews(vacancy_id)
    return InterviewListResponse(items=[InterviewResponse.model_validate(i) for i in interviews])
