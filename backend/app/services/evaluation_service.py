"""LLM-разбор ответов кандидата -> отчёт по интервью (report_json).

Один LLM-вызов на ответ (тот же OpenRouter-паттерн, что `vacancy_llm_service.py`): даём
модели transcript_text ответа и reference_answer/intent вопроса, просим оценку 1-5 по
фиксированным якорям (см. `app/prompts/evaluation_answer_score.txt`) и флаг «отвечал с
подсказкой». Дальше — уже готовое правило агрегации (`evaluation_verdict`), плюс один
дополнительный LLM-вызов, который сводит уже выставленные оценки в summary/strengths/
weaknesses (см. `app/prompts/evaluation_summary.txt`) — не придумывает новых фактов, только
обобщает то, что уже посчитано.

Запускается синхронно сразу при событии `interview_completed` (см.
`interview_event_service.py`) — без очереди/воркера, см. обсуждение в чате: полноценный
async batch-контур (`evaluation-agent/src/evaluation_agent/worker.py`) не реализован и не
нужен для этого объёма (несколько LLM-вызовов на интервью, не тяжёлый ASR-проход).
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
from app.prompts import load_prompt
from app.services.evaluation_verdict import (
    QuestionScore,
    SkillVerdict,
    aggregate_skills,
    compute_verdict,
)

DEFAULT_MODEL = "minimax/minimax-m3:free"
BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

_SKILL_CLASS_LABEL = {
    "fail": "не подтверждён",
    "ambiguous": "требует проверки",
    "pass": "подтверждён",
    "untested": "не проверен",
}


class EvaluationError(Exception):
    """LLM не вернул валидную оценку (сетевая ошибка/невалидный ответ)."""


class _AnswerScore(BaseModel):
    score: int = Field(ge=1, le=5)
    answered_with_hint: bool = False
    rationale: str = ""


class _SummaryText(BaseModel):
    summary: str = ""
    strengths: str = ""
    weaknesses: str = ""


_SYSTEM_PROMPT = load_prompt("evaluation_answer_score.txt")
_SUMMARY_SYSTEM_PROMPT = load_prompt("evaluation_summary.txt")


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text.removeprefix("```")
        if text.endswith("```"):
            text = text[: -len("```")]
    return text.strip()


def _skill_reasoning(rows: list[dict]) -> list[str]:
    return [
        f"Вопрос {row['order']} ({row['score']}/5): {row['rationale']}" for row in rows if row["rationale"]
    ]


# Итоговый уровень владения навыком — 1-3, отдельная (более грубая) шкала поверх
# per-question effective_score (1-5): не «сколько баллов набрал по вопросам», а
# «на каком уровне подтверждено владение навыком в целом». Считается детерминированно
# из effective_score, не отдельным LLM-вызовом — чтобы уровень не расходился с
# skill_class/effective_score, на которых уже строится verdict.
_MASTERY_LABEL = {1: "Начальный уровень", 2: "Базовый уверенный уровень", 3: "Продвинутый уровень"}


def _mastery_level(effective_score: int | None) -> int | None:
    if effective_score is None:
        return None
    if effective_score <= 2:
        return 1
    if effective_score == 3:
        return 2
    return 3


class EvaluationService:
    # api_key не читается в конструкторе — тот же найденный ранее баг с eager-чтением
    # OPENROUTER_API_KEY в vacancy_llm_service.py, см. комментарий там.
    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.model = model or os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=60.0)

    async def _complete(self, system_prompt: str, user_prompt: str) -> str:
        api_key = self._api_key or os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise EvaluationError("OPENROUTER_API_KEY не задан — оценка недоступна.")
        try:
            response = await self._client.post(
                BASE_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
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
            return payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise EvaluationError(f"OpenRouter вернул неожиданный ответ: {payload}") from exc

    async def _score_answer(self, question: Question, answer: Answer) -> _AnswerScore:
        user_prompt = (
            f"Вопрос: {question.text}\n"
            f"Intent: {question.intent or '(не указан)'}\n"
            f"Эталонный ответ: {question.reference_answer or '(не указан)'}\n"
            f"Ответ кандидата (расшифровка): {answer.transcript_text or '(пусто — не ответил)'}\n"
        )
        raw = await self._complete(_SYSTEM_PROMPT, user_prompt)
        try:
            return _AnswerScore.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001
            raise EvaluationError(f"Не удалось разобрать оценку ответа: {exc}") from exc

    async def _summarize(self, skill_verdicts: list[dict]) -> _SummaryText:
        if not skill_verdicts:
            return _SummaryText(
                summary="Кандидат не ответил ни на один оцениваемый вопрос — сводка недоступна.",
            )
        lines = []
        for sv in skill_verdicts:
            label = _SKILL_CLASS_LABEL.get(sv["skill_class"], sv["skill_class"])
            required = "обязательный" if sv["required"] else "желательный"
            mastery = _MASTERY_LABEL.get(sv["mastery_level"], "не определён")
            lines.append(
                f"- {sv['skill_tag']} ({required}): {label}, эффективный балл {sv['effective_score']}, "
                f"уровень владения: {mastery}"
            )
            for line in sv["reasoning"]:
                lines.append(f"  · {line}")
        user_prompt = "Разбор по навыкам:\n" + "\n".join(lines)
        raw = await self._complete(_SUMMARY_SYSTEM_PROMPT, user_prompt)
        try:
            return _SummaryText.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001
            raise EvaluationError(f"Не удалось разобрать сводку: {exc}") from exc

    async def evaluate_interview(
        self,
        vacancy: Vacancy,
        questions: list[Question],
        answers: list[Answer],
    ) -> dict:
        """Строит report_json: per_question (сырые оценки) + skill_verdicts (с аргументами
        по каждому навыку) + verdict (с аргументами по обязательным навыкам) + summary/
        strengths/weaknesses.

        Оцениваем только role="assessment" вопросы с непустой расшифровкой — warmup/closing
        не несут skill_tag и не участвуют в вердикте (см. evaluation_verdict.aggregate_skills).
        """
        questions_by_id = {q.id: q for q in questions}
        per_question: list[dict] = []
        question_scores: list[QuestionScore] = []
        rows_by_skill: dict[str, list[dict]] = {}

        for answer in answers:
            question = questions_by_id.get(answer.question_id)
            if question is None or question.role != "assessment":
                continue
            if not (answer.transcript_text or "").strip():
                continue

            scored = await self._score_answer(question, answer)
            skill_tags = question.skill_tag or ["_unspecified"]
            row = {
                "question_id": str(question.id),
                "order": question.order,
                "skill_tag": skill_tags,
                "difficulty": question.difficulty,
                "score": scored.score,
                "answered_with_hint": scored.answered_with_hint,
                "rationale": scored.rationale,
            }
            per_question.append(row)
            for tag in skill_tags:
                rows_by_skill.setdefault(tag, []).append(row)
                question_scores.append(
                    QuestionScore(
                        skill_tag=tag,
                        score=scored.score,
                        difficulty=question.difficulty,
                        answered_with_hint=scored.answered_with_hint,
                    )
                )

        required_skills = set(vacancy.required_skills or [])
        raw_skill_verdicts: list[SkillVerdict] = aggregate_skills(question_scores, required_skills)
        verdict = compute_verdict(raw_skill_verdicts, has_contradictions=False)

        skill_verdicts = [
            {
                **sv.model_dump(),
                "reasoning": _skill_reasoning(rows_by_skill.get(sv.skill_tag, [])),
                "mastery_level": _mastery_level(sv.effective_score),
            }
            for sv in raw_skill_verdicts
        ]

        verdict_reasoning = [
            f"«{sv['skill_tag']}» (обязательный) — {_SKILL_CLASS_LABEL[sv['skill_class']]}"
            + (f", {_MASTERY_LABEL[sv['mastery_level']]}" if sv["mastery_level"] else "")
            + ("; " + "; ".join(sv["reasoning"]) if sv["reasoning"] else " (вопросов не было)")
            for sv in skill_verdicts
            if sv["required"]
        ]

        summary = await self._summarize(skill_verdicts)

        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "model": self.model,
            "verdict": verdict.value,
            "verdict_reasoning": verdict_reasoning,
            "skill_verdicts": skill_verdicts,
            "per_question": per_question,
            "summary": summary.summary,
            "strengths": summary.strengths,
            "weaknesses": summary.weaknesses,
        }
