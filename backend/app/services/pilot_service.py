from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clarification import ClarificationRequest
from app.models.handoff import Handoff
from app.models.interview import Interview
from app.models.manager_opinion_grant import ManagerOpinionGrant
from app.models.role_assignment import InternalRoleAssignment
from app.models.user import InternalUser
from app.models.vacancy import Vacancy

OPEN_CLARIFICATION = {"requested", "received", "in_progress"}
_PRODUCT_FORWARD = (
    "invited",
    "opened",
    "consented",
    "device_checked",
    "ready",
    "in_interview",
    "interrupted",
    "submitted",
    "report_processing",
    "report_ready",
)
_PRODUCT_FORWARD_INDEX = {name: index for index, name in enumerate(_PRODUCT_FORWARD)}
_TERMINAL_PRODUCT = frozenset({"expired", "declined", "consent_revoked", "data_deleted"})


def _is_forward_product_state(current: str, target: str) -> bool:
    if current == target:
        return False
    if current in _TERMINAL_PRODUCT:
        return False
    if target in _TERMINAL_PRODUCT:
        return True
    current_idx = _PRODUCT_FORWARD_INDEX.get(current, -1)
    target_idx = _PRODUCT_FORWARD_INDEX.get(target)
    if target_idx is None:
        return False
    consented_idx = _PRODUCT_FORWARD_INDEX["consented"]
    if current_idx < consented_idx and target_idx > consented_idx:
        return False
    return target_idx > current_idx


class PilotError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class PilotService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _interview(self, interview_id: UUID) -> Interview:
        interview = await self.session.get(Interview, interview_id)
        if interview is None:
            raise PilotError(404, "Interview not found.")
        return interview

    async def request_extra(self, interview_id: UUID, actor_id: UUID) -> ClarificationRequest:
        await self._interview(interview_id)
        item = ClarificationRequest(
            interview_id=interview_id,
            type="extra",
            status="requested",
            created_by_id=actor_id,
            extra_token=secrets.token_urlsafe(16),
        )
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def request_audit(self, interview_id: UUID, actor_id: UUID) -> ClarificationRequest:
        await self._interview(interview_id)
        item = ClarificationRequest(
            interview_id=interview_id,
            type="expert_audit",
            status="requested",
            created_by_id=actor_id,
        )
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def close_clarification(
        self, interview_id: UUID, clarification_id: UUID, reason: str
    ) -> ClarificationRequest:
        item = await self.session.get(ClarificationRequest, clarification_id)
        if item is None or item.interview_id != interview_id:
            raise PilotError(404, "Clarification not found.")
        item.status = "closed"
        item.close_reason = reason
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def list_clarifications(self, interview_id: UUID) -> list[ClarificationRequest]:
        await self._interview(interview_id)
        result = await self.session.execute(
            select(ClarificationRequest).where(ClarificationRequest.interview_id == interview_id)
        )
        return list(result.scalars().all())

    async def list_hiring_managers(self) -> list[InternalUser]:
        result = await self.session.execute(
            select(InternalUser)
            .join(InternalRoleAssignment, InternalRoleAssignment.user_id == InternalUser.id)
            .where(InternalRoleAssignment.role_code == "hiring_manager")
        )
        return list(result.scalars().unique().all())

    async def extra_for_token(self, access_token: str, extra_id: str) -> ClarificationRequest:
        interview = (
            await self.session.execute(select(Interview).where(Interview.access_token == access_token))
        ).scalar_one_or_none()
        if interview is None:
            raise PilotError(404, "interview not found")
        filters = [
            ClarificationRequest.interview_id == interview.id,
            ClarificationRequest.type == "extra",
        ]
        by_token = (
            await self.session.execute(
                select(ClarificationRequest).where(*filters, ClarificationRequest.extra_token == extra_id)
            )
        ).scalar_one_or_none()
        if by_token is not None:
            return by_token
        try:
            extra_uuid = UUID(extra_id)
        except ValueError as exc:
            raise PilotError(404, "Extra request not found.") from exc
        by_id = (
            await self.session.execute(
                select(ClarificationRequest).where(*filters, ClarificationRequest.id == extra_uuid)
            )
        ).scalar_one_or_none()
        if by_id is None:
            raise PilotError(404, "Extra request not found.")
        return by_id

    async def submit_extra(self, access_token: str, extra_id: str, answer: str) -> ClarificationRequest:
        item = await self.extra_for_token(access_token, extra_id)
        item.status = "received"
        _ = answer
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def open_clarifications(self, interview_id: UUID) -> list[ClarificationRequest]:
        result = await self.session.execute(
            select(ClarificationRequest).where(
                ClarificationRequest.interview_id == interview_id,
                ClarificationRequest.status.in_(OPEN_CLARIFICATION),
            )
        )
        return list(result.scalars().all())

    async def handoff(
        self, interview_id: UUID, recruiter_id: UUID, to_manager_id: UUID, summary: str
    ) -> Handoff:
        interview = await self._interview(interview_id)
        if interview.recruiter_decision == "rejected":
            raise PilotError(409, "Candidate already rejected.")
        if await self.open_clarifications(interview_id):
            raise PilotError(409, "Close open clarifications before handoff.")
        existing = await self.session.execute(select(Handoff).where(Handoff.interview_id == interview_id))
        if existing.scalar_one_or_none() is not None:
            raise PilotError(409, "Already handed off.")
        row = Handoff(
            interview_id=interview_id,
            from_recruiter_id=recruiter_id,
            to_manager_id=to_manager_id,
            summary=summary,
        )
        interview.recruiter_decision = "handed_off"
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def grant_opinion(
        self, interview_id: UUID, recruiter_id: UUID, manager_id: UUID
    ) -> ManagerOpinionGrant:
        interview = await self._interview(interview_id)
        interview.recruiter_decision = "opinion_asked"
        row = ManagerOpinionGrant(
            interview_id=interview_id,
            manager_id=manager_id,
            granted_by_id=recruiter_id,
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def reject(self, interview_id: UUID) -> Interview:
        interview = await self._interview(interview_id)
        interview.recruiter_decision = "rejected"
        await self.session.commit()
        await self.session.refresh(interview)
        return interview

    async def manager_can_view(self, interview_id: UUID, manager_id: UUID) -> bool:
        handoff = await self.session.execute(
            select(Handoff).where(
                Handoff.interview_id == interview_id,
                Handoff.to_manager_id == manager_id,
                Handoff.returned_at.is_(None),
            )
        )
        if handoff.scalar_one_or_none() is not None:
            return True
        grant = await self.session.execute(
            select(ManagerOpinionGrant).where(
                ManagerOpinionGrant.interview_id == interview_id,
                ManagerOpinionGrant.manager_id == manager_id,
            )
        )
        return grant.scalar_one_or_none() is not None

    async def list_manager_candidates(self, manager_id: UUID) -> list[dict]:
        handoffs = (
            await self.session.execute(
                select(Handoff).where(Handoff.to_manager_id == manager_id, Handoff.returned_at.is_(None))
            )
        ).scalars().all()
        grants = (
            await self.session.execute(
                select(ManagerOpinionGrant).where(ManagerOpinionGrant.manager_id == manager_id)
            )
        ).scalars().all()
        items: list[dict] = []
        seen: set[UUID] = set()
        for row in handoffs:
            interview = await self._interview(row.interview_id)
            vacancy = await self.session.get(Vacancy, interview.vacancy_id)
            recruiter = await self.session.get(InternalUser, row.from_recruiter_id)
            seen.add(row.interview_id)
            items.append(
                {
                    "interview": interview,
                    "vacancy_title": vacancy.title if vacancy else "",
                    "handed_off_at": row.created_at,
                    "from_recruiter_name": recruiter.name if recruiter else None,
                    "summary": row.summary,
                    "access": "handoff",
                }
            )
        for row in grants:
            if row.interview_id in seen:
                continue
            interview = await self._interview(row.interview_id)
            vacancy = await self.session.get(Vacancy, interview.vacancy_id)
            items.append(
                {
                    "interview": interview,
                    "vacancy_title": vacancy.title if vacancy else "",
                    "handed_off_at": None,
                    "from_recruiter_name": None,
                    "summary": None,
                    "access": "opinion",
                }
            )
        return items

    async def return_from_manager(self, interview_id: UUID, manager_id: UUID) -> Interview:
        handoff = (
            await self.session.execute(
                select(Handoff).where(
                    Handoff.interview_id == interview_id,
                    Handoff.to_manager_id == manager_id,
                    Handoff.returned_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if handoff is None:
            raise PilotError(404, "Active handoff not found.")
        interview = await self._interview(interview_id)
        handoff.returned_at = datetime.now(timezone.utc)
        interview.recruiter_decision = "awaiting"
        await self.session.commit()
        await self.session.refresh(interview)
        return interview

    async def expert_queue(self) -> dict:
        calibrations = (
            await self.session.execute(select(Vacancy).where(Vacancy.status == "calibration"))
        ).scalars().all()
        audits = (
            await self.session.execute(
                select(ClarificationRequest).where(
                    ClarificationRequest.type == "expert_audit",
                    ClarificationRequest.status.in_(OPEN_CLARIFICATION),
                )
            )
        ).scalars().all()
        audit_items = []
        for item in audits:
            interview = await self._interview(item.interview_id)
            vacancy = await self.session.get(Vacancy, interview.vacancy_id)
            audit_items.append(
                {
                    "interview": interview,
                    "vacancy_id": interview.vacancy_id,
                    "vacancy_title": vacancy.title if vacancy else "",
                }
            )
        return {"calibrations": list(calibrations), "audits": audit_items}

    async def mark_consent(self, access_token: str) -> Interview:
        interview = (
            await self.session.execute(select(Interview).where(Interview.access_token == access_token))
        ).scalar_one_or_none()
        if interview is None:
            raise PilotError(404, "interview not found")
        if interview.status == "completed" or interview.product_state in {"expired", "data_deleted"}:
            raise PilotError(409, "interview already completed")
        if interview.consented_at is None:
            interview.consented_at = datetime.now(timezone.utc)
        if interview.product_state in {"invited", "opened"}:
            interview.product_state = "consented"
        await self.session.commit()
        await self.session.refresh(interview)
        return interview

    async def mark_progress(self, access_token: str, product_state: str) -> Interview:
        allowed = {
            "opened",
            "device_checked",
            "ready",
            "in_interview",
            "interrupted",
            "submitted",
            "report_processing",
            "report_ready",
            "expired",
            "declined",
            "consent_revoked",
            "data_deleted",
        }
        if product_state not in allowed:
            raise PilotError(422, "Unknown product_state.")
        interview = (
            await self.session.execute(select(Interview).where(Interview.access_token == access_token))
        ).scalar_one_or_none()
        if interview is None:
            raise PilotError(404, "interview not found")
        if interview.status == "completed" or interview.product_state in {"expired", "data_deleted"}:
            raise PilotError(409, "interview already completed")
        if not _is_forward_product_state(interview.product_state, product_state):
            raise PilotError(409, "Invalid product_state transition.")
        interview.product_state = product_state
        await self.session.commit()
        await self.session.refresh(interview)
        return interview
