"""Точка входа воркера batch-контура оценки (outbox-режим).

Рабочий цикл:
1. Забрать (claim) одну pending-задачу из backend.
2. Получить evaluation-input для этого интервью.
3. Оценить каждый ответленный вопрос LLM-судьёй.
4. Агрегировать skill_scores через verdict.py.
5. Сохранить Evaluation в backend.
6. Отметить задачу complete или fail (с retry).

Если backend недоступен или пустая очередь — воркер спит POLL_INTERVAL_SECONDS
и пробует снова. Redis pub/sub больше не используется как единственный триггер.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import traceback
from datetime import UTC, datetime
from typing import Any

from evaluation_agent.backend_client import BackendClient
from evaluation_agent.config import settings
from evaluation_agent.llm_judge import LLMJudge, QuestionToScore, VacancyContext, get_judge
from evaluation_agent.schema import Difficulty, QuestionScore
from evaluation_agent.verdict import aggregate_skills, compute_verdict

logger = logging.getLogger(__name__)


def _difficulty(value: str) -> Difficulty:
    try:
        return Difficulty(value)
    except ValueError:
        return Difficulty.BASELINE


def _build_summary(
    verdict_value: str,
    skill_verdicts: list,
    candidate_name: str | None,
) -> tuple[str, str]:
    name = candidate_name or "Кандидат"
    intro = f"{name} прошёл интервью. Вердикт: {verdict_value}."

    passes = [v.skill_tag for v in skill_verdicts if v.skill_class.value == "pass"]
    fails = [v.skill_tag for v in skill_verdicts if v.skill_class.value == "fail"]
    ambiguous = [v.skill_tag for v in skill_verdicts if v.skill_class.value in ("ambiguous", "untested")]

    parts: list[str] = []
    if passes:
        parts.append(f"уверенно продемонстрированы навыки: {', '.join(passes)}")
    if fails:
        parts.append(f"не подтверждены обязательные навыки: {', '.join(fails)}")
    if ambiguous:
        parts.append(f"требуют дополнительной проверки: {', '.join(ambiguous)}")

    conclusion = "; ".join(parts) if parts else "Данных для вывода недостаточно."
    return intro, conclusion


async def process_job(
    job: dict[str, Any],
    backend: BackendClient,
    judge: LLMJudge,
) -> None:
    interview_id = job["interview_id"]
    job_id = job["id"]
    try:
        logger.info("Processing job %s for interview %s", job_id, interview_id)

        interview_input = await backend.get_evaluation_input(interview_id)

        vacancy_data = interview_input["vacancy"]
        vacancy_context = VacancyContext(
            title=vacancy_data["title"],
            description=vacancy_data["description"],
            grade=vacancy_data["grade"],
            required_skills=vacancy_data["required_skills"],
            nice_to_have_skills=vacancy_data["nice_to_have_skills"],
        )

        per_question: list[dict[str, Any]] = []
        question_scores: list[QuestionScore] = []
        contradictions: list[dict[str, Any]] = []

        for question in interview_input.get("questions", []):
            answer = question.get("answer")
            transcript = answer.get("transcript_text") if answer else None
            if not transcript:
                logger.debug("Skipping question %s without transcript", question["question_id"])
                continue

            question_to_score = QuestionToScore(
                question_id=question["question_id"],
                text=question["text"],
                reference_answer=question["reference_answer"] or "",
                intent=question.get("intent"),
                difficulty=question["difficulty"],
                format=question["format"],
                skill_tags=question["skill_tag"],
                transcript=transcript,
                answered_with_hint=question.get("answered_with_hint", False),
                vacancy=vacancy_context,
            )

            judgment = await judge.judge(question_to_score)

            per_question.append(
                {
                    "question_id": question["question_id"],
                    "skill_scores": [score.model_dump(mode="json") for score in judgment.skill_scores],
                    "quotes": [
                        {"text": quote, "question_id": question["question_id"]}
                        for quote in judgment.quotes
                    ],
                    "confidence": judgment.confidence,
                    "answered_with_hint": question.get("answered_with_hint", False),
                    "report": judgment.report,
                }
            )

            for score in judgment.skill_scores:
                question_scores.append(
                    QuestionScore(
                        skill_tag=score.skill_tag,
                        score=score.score,
                        difficulty=_difficulty(question["difficulty"]),
                        answered_with_hint=question.get("answered_with_hint", False),
                    )
                )

        required_skills = set(vacancy_context.required_skills)
        skill_verdicts = aggregate_skills(question_scores, required_skills)
        verdict_value = compute_verdict(skill_verdicts, has_contradictions=bool(contradictions))

        confirmed = [v.skill_tag for v in skill_verdicts if v.skill_class.value == "pass"]
        unconfirmed = [v.skill_tag for v in skill_verdicts if v.skill_class.value != "pass"]

        scored_effective = [v.effective_score for v in skill_verdicts if v.effective_score is not None]
        overall_score = round(sum(scored_effective) / len(scored_effective)) if scored_effective else None

        summary_intro, summary_conclusion = _build_summary(
            verdict_value.value,
            skill_verdicts,
            interview_input.get("interview", {}).get("candidate_name"),
        )

        payload: dict[str, Any] = {
            "per_question": per_question,
            "overall_score": overall_score,
            "verdict": verdict_value.value,
            "confirmed_skills": confirmed,
            "unconfirmed_skills": unconfirmed,
            "contradictions_found": contradictions,
            "strengths": [f"Подтверждён навык: {tag}" for tag in confirmed],
            "risks": [f"Не подтверждён навык: {tag}" for tag in unconfirmed],
            "summary_intro": summary_intro,
            "summary_conclusion": summary_conclusion,
            "model_version": settings.llm_model,
            "prompt_version": settings.prompt_version,
            "generated_at": datetime.now(UTC).isoformat(),
        }

        await backend.post_evaluation(interview_id, payload)
        await backend.complete_evaluation_job(job_id)
        logger.info(
            "Evaluation completed for interview %s (verdict=%s)", interview_id, verdict_value.value
        )
    except Exception:
        logger.exception("Job %s failed", job_id)
        try:
            await backend.fail_evaluation_job(job_id, traceback.format_exc())
        except Exception:
            logger.exception("Failed to report job failure for %s", job_id)


async def run_worker() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    stop_event = asyncio.Event()

    def _signal_handler(_sig: int) -> None:
        logger.info("Shutdown signal received")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler, sig)

    async with BackendClient() as backend:
        judge = get_judge()
        logger.info(
            "Worker started. Polling backend every %s seconds.", settings.poll_interval_seconds
        )

        while not stop_event.is_set():
            job: dict[str, Any] | None = None
            try:
                job = await backend.claim_evaluation_job()
            except Exception:
                logger.exception("Failed to claim evaluation job")
                await asyncio.sleep(settings.poll_interval_seconds)
                continue

            if job is None:
                await asyncio.sleep(settings.poll_interval_seconds)
                continue

            await process_job(job, backend, judge)


if __name__ == "__main__":
    asyncio.run(run_worker())
