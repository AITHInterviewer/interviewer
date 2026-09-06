"""MVP-запись событий/ответов интервью — план, раздел «Backend: new services/repositories».

Два независимых, но связанных куска:
- `record_event`: полный сырой `Event` из Redis-канала (см. `control_channel.py`) в
  `interview_event`, безусловно, для любого `EventType` (не только тех, что
  `to_control_event` транслирует кандидатскому UI).
- Агрегация `Answer` из того же потока: `question_started` заводит строку,
  `candidate_utterance` дописывает `transcript_text`, `question_completed` закрывает
  `completed_at`. Отдельно `record_candidate_input` — единственное сообщение кандидата
  по control-каналу (`contracts/control-channel.md`), для `input_format="code"` пишет
  `code_submission`/`code_language`/`code_snapshots`.

Не реализует T020/T021/T028 (медиа-загрузка, форвардинг в decision loop live-agent) —
сознательно, см. план, «Recording depth: MVP».
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.evaluation_job import EvaluationJob
from app.models.interview import Interview
from app.models.interview_event import InterviewEvent
from app.models.question import Question
from app.services.livekit_egress import EgressError, stop_recording

logger = logging.getLogger(__name__)


def _parse_question_id(raw: Any) -> uuid.UUID | None:
    """`question_id` из live-agent иногда не настоящий Postgres UUID (мок-вакансия, см.
    `control_channel.py::_resolve_input_format`) — в этом случае аггрегация ответа
    невозможна, но сырое событие всё равно должно быть записано."""
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        return None


def _parse_ts(raw: Any) -> datetime:
    if raw:
        try:
            return datetime.fromisoformat(str(raw))
        except ValueError:
            pass
    return datetime.now(UTC)


class InterviewEventService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record_event(
        self,
        interview_id: uuid.UUID | str,
        raw_event: dict[str, Any],
        source_event_id: str | None = None,
    ) -> None:
        interview_id = uuid.UUID(str(interview_id))
        if source_event_id is not None:
            existing = await self.session.scalar(
                select(InterviewEvent.id).where(InterviewEvent.source_event_id == source_event_id)
            )
            if existing is not None:
                return
        self.session.add(
            InterviewEvent(
                interview_id=interview_id,
                event_type=str(raw_event.get("type", "unknown")),
                payload=raw_event,
                source_event_id=source_event_id,
            )
        )
        await self._apply_aggregation(interview_id, raw_event)
        if raw_event.get("type") == "question_started":
            await self._update_current_question(interview_id, raw_event)
        completed = str(raw_event.get("type")) == "interview_completed"
        if completed:
            await self._handle_interview_completed(interview_id)
        await self.session.commit()
        if completed:
            await self._stop_recording(interview_id)

    async def _update_current_question(self, interview_id: uuid.UUID, raw_event: dict[str, Any]) -> None:
        """Только `question_started` (НИКОГДА checkin/adaptive_question_asked) — см.
        `Interview.current_question_text` докстринг в модели: доп./наводящий вопрос от LLM
        не должен стирать текст основного вопроса. `question_id` иногда не резолвится в
        Postgres UUID (мок-вакансия/дев-данные, см. control_channel.py) — текст всё равно
        пишем, `current_question_id` в этом случае остаётся NULL."""
        interview = await self.session.get(Interview, interview_id)
        if interview is None:
            return
        interview.current_question_id = _parse_question_id(raw_event.get("question_id"))
        interview.current_question_text = raw_event.get("payload", {}).get("text")

    async def record_candidate_input(self, interview_id: uuid.UUID | str, message: dict[str, Any]) -> None:
        interview_id = uuid.UUID(str(interview_id))
        self.session.add(
            InterviewEvent(interview_id=interview_id, event_type="candidate_input", payload=message)
        )

        question_id = _parse_question_id(message.get("question_id"))
        if question_id is not None and message.get("input_format") == "code":
            answer = await self._get_or_create_answer(interview_id, question_id, datetime.now(UTC))
            content = message.get("content", "")
            answer.code_submission = content

            question = await self.session.get(Question, question_id)
            if question is not None and question.stimulus:
                answer.code_language = question.stimulus.get("language")

            answer.code_snapshots = [
                *(answer.code_snapshots or []),
                {"ts": datetime.now(UTC).isoformat(), "content": content},
            ]

        await self.session.commit()

    async def record_security_signal(self, interview_id: uuid.UUID | str, message: dict[str, Any]) -> None:
        """«Блок безопасности» на карточке кандидата (см. `control-channel.ts` на фронте) —
        переключение вкладки/пропадание камеры. Только сырой лог, никакой агрегации в
        Answer и никакого вердикта тут — recruiter сам решает, что с этим делать."""
        interview_id = uuid.UUID(str(interview_id))
        self.session.add(
            InterviewEvent(
                interview_id=interview_id,
                event_type=f"security:{message.get('signal', 'unknown')}",
                payload=message,
            )
        )
        await self.session.commit()

    async def _apply_aggregation(self, interview_id: uuid.UUID | str, raw_event: dict[str, Any]) -> None:
        event_type = raw_event.get("type")
        question_id = _parse_question_id(raw_event.get("question_id"))
        if question_id is None or event_type not in (
            "question_started",
            "candidate_utterance",
            "question_completed",
        ):
            return

        ts = _parse_ts(raw_event.get("ts"))
        answer = await self._get_or_create_answer(interview_id, question_id, ts)

        if event_type == "candidate_utterance":
            text = raw_event.get("payload", {}).get("text", "")
            answer.transcript_text = (answer.transcript_text or "") + text
        elif event_type == "question_completed":
            answer.completed_at = ts

    async def _get_or_create_answer(
        self, interview_id: uuid.UUID | str, question_id: uuid.UUID, started_at: datetime
    ) -> Answer:
        statement = select(Answer).where(
            Answer.interview_id == interview_id, Answer.question_id == question_id
        )
        result = await self.session.execute(statement)
        answer = result.scalar_one_or_none()
        if answer is not None:
            return answer

        question = await self.session.get(Question, question_id)
        role = question.role if question is not None else "assessment"

        answer = Answer(
            interview_id=interview_id,
            question_id=question_id,
            role=role,
            transcript_text="",
            started_at=started_at,
        )
        self.session.add(answer)
        await self.session.flush()
        return answer

    async def _handle_interview_completed(self, interview_id: uuid.UUID) -> None:
        """Transactional outbox: interview completed -> create evaluation_job.

        Оценка больше НЕ synchronous тут (бывший `_complete_interview` из main): контур
        отдан evaluation-agent — бэкенд только ставит `product_state="report_processing"`
        для продуктовой оси (канбан/фронт, см. frontend/lib/pipeline.ts) и кладёт задачу
        в outbox. Результат агент присылает через POST /evaluation (см.
        `evaluation_service.py`), там же `product_state` дойдёт до "report_ready"."""
        interview = await self.session.get(Interview, interview_id)
        if interview is not None:
            interview.status = "completed"
            interview.completed_at = datetime.now(UTC)
            interview.product_state = "report_processing"

        existing = await self.session.scalar(
            select(EvaluationJob).where(EvaluationJob.interview_id == interview_id)
        )
        if existing is None:
            self.session.add(EvaluationJob(interview_id=interview_id, status="pending"))

    async def _stop_recording(self, interview_id: uuid.UUID) -> None:
        """Остановка LiveKit Egress-записи — после коммита: не отменяем запись, даже
        если транзакция completion'а вдруг откатилась (как в бывшем `_complete_interview`)."""
        interview = await self.session.get(Interview, interview_id)
        if interview is None or interview.recording_egress_id is None:
            return
        try:
            await stop_recording(interview.recording_egress_id)
        except EgressError:
            logger.exception("livekit_egress: не удалось остановить запись интервью %s", interview_id)
