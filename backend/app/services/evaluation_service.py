"""LLM-разбор ответов кандидата -> отчёт по интервью (report_json).

Один LLM-вызов на ответ (тот же OpenRouter-паттерн, что `vacancy_llm_service.py`): даём
модели transcript_text ответа и reference_answer/intent вопроса, просим оценку 0-100 и
флаг «отвечал с подсказкой». Дальше — уже готовое правило агрегации (`evaluation_verdict`).

Запускается синхронно сразу при событии `interview_completed` (см.
`interview_event_service.py`) — без очереди/воркера, см. обсуждение в чате: полноценный
async batch-контур (`evaluation-agent/src/evaluation_agent/worker.py`) не реализован и не
нужен для этого объёма (один LLM-вызов на ответ, не тяжёлый ASR-проход).
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime

import httpx
from pydantic import BaseModel, Field

from app.models.answer import Answer
from app.models.question import Question
from app.models.vacancy import Vacancy
from app.services.evaluation_verdict import (
    QuestionScore,
    aggregate_skills,
    compute_verdict,
)

DEFAULT_MODEL = "minimax/minimax-m3:free"
BASE_URL = "https://openrouter.ai/api/v1/chat/completions"


class EvaluationError(Exception):
    """LLM не вернул валидную оценку (сетевая ошибка/невалидный ответ)."""


class _AnswerScore(BaseModel):
    score: int = Field(ge=0, le=100)
    answered_with_hint: bool = False
    rationale: str = ""


_SCHEMA_HINT = """

Ответь СТРОГО одним JSON-объектом, без markdown-обёртки (```), без текста до или после JSON:
{"score": 0-100, "answered_with_hint": true|false, "rationale": "..."}"""

_SYSTEM_PROMPT = """Ты оцениваешь ответ кандидата на технический вопрос собеседования. \
Сравни ответ с эталоном (reference_answer) и намерением вопроса (intent), поставь оценку \
0-100: 0 — ответа по существу нет или он неверный, 40-59 — ответ частичный/поверхностный, \
60-100 — ответ по существу верный и достаточно полный. answered_with_hint=true, только если \
из текста ответа видно, что кандидату явно подсказали направление (в самом transcript_text \
есть текст подсказки/наводящего уточнения от интервьюера). rationale — одно короткое \
предложение на русском, почему такая оценка.""" + _SCHEMA_HINT


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text.removeprefix("```")
        if text.endswith("```"):
            text = text[: -len("```")]
    return text.strip()


class EvaluationService:
    # api_key не читается в конструкторе — тот же найденный ранее баг с eager-чтением
    # OPENROUTER_API_KEY в vacancy_llm_service.py, см. комментарий там.
    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.model = model or os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=60.0)

    async def _score_answer(self, question: Question, answer: Answer) -> _AnswerScore:
        api_key = self._api_key or os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise EvaluationError("OPENROUTER_API_KEY не задан — оценка недоступна.")

        user_prompt = (
            f"Вопрос: {question.text}\n"
            f"Intent: {question.intent or '(не указан)'}\n"
            f"Эталонный ответ: {question.reference_answer or '(не указан)'}\n"
            f"Ответ кандидата (расшифровка): {answer.transcript_text or '(пусто — не ответил)'}\n"
        )
        try:
            response = await self._client.post(
                BASE_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvaluationError(f"OpenRouter недоступен: {exc}") from exc

        payload = response.json()
        try:
            raw = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise EvaluationError(f"OpenRouter вернул неожиданный ответ: {payload}") from exc
        try:
            return _AnswerScore.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001
            raise EvaluationError(f"Не удалось разобрать оценку ответа: {exc}") from exc

    async def evaluate_interview(
        self,
        vacancy: Vacancy,
        questions: list[Question],
        answers: list[Answer],
    ) -> dict:
        """Строит report_json: per_question (сырые оценки) + skill_verdicts + verdict.

        Оцениваем только role="assessment" вопросы с непустой расшифровкой — warmup/closing
        не несут skill_tag и не участвуют в вердикте (см. evaluation_verdict.aggregate_skills).
        """
        questions_by_id = {q.id: q for q in questions}
        per_question: list[dict] = []
        question_scores: list[QuestionScore] = []

        for answer in answers:
            question = questions_by_id.get(answer.question_id)
            if question is None or question.role != "assessment":
                continue
            if not (answer.transcript_text or "").strip():
                continue

            scored = await self._score_answer(question, answer)
            skill_tags = question.skill_tag or ["_unspecified"]
            per_question.append(
                {
                    "question_id": str(question.id),
                    "order": question.order,
                    "skill_tag": skill_tags,
                    "difficulty": question.difficulty,
                    "score": scored.score,
                    "answered_with_hint": scored.answered_with_hint,
                    "rationale": scored.rationale,
                }
            )
            for tag in skill_tags:
                question_scores.append(
                    QuestionScore(
                        skill_tag=tag,
                        score=scored.score,
                        difficulty=question.difficulty,
                        answered_with_hint=scored.answered_with_hint,
                    )
                )

        required_skills = set(vacancy.required_skills or [])
        skill_verdicts = aggregate_skills(question_scores, required_skills)
        verdict = compute_verdict(skill_verdicts, has_contradictions=False)

        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "model": self.model,
            "verdict": verdict.value,
            "skill_verdicts": [sv.model_dump() for sv in skill_verdicts],
            "per_question": per_question,
        }
