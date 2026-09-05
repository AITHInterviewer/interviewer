"""LLM-судья: по вопросу + эталону + транскрипту выдаёт QuestionScore и report.

Реализации:
- `DummyGPTJudge` — детерминированный mock review для тестов/локальной разработки.
- `ClaudeAgentSDKJudge` — Claude через `claude-agent-sdk` (тот же подход, что
  `backend/app/services/vacancy_llm_service.py`).
- `KimiJudge` — Kimi через OpenAI-совместимый Moonshot Chat Completions API.

Интерфейс единый, чтобы воркер не зависел от провайдера.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import BaseModel, Field

from evaluation_agent.config import settings

logger = logging.getLogger(__name__)


class SkillScoreResult(BaseModel):
    skill_tag: str
    score: int = Field(..., ge=0, le=100)
    rationale: str


class QuestionJudgment(BaseModel):
    skill_scores: list[SkillScoreResult]
    quotes: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
    report: str | None = None


@dataclass(frozen=True)
class VacancyContext:
    title: str
    description: str
    grade: str
    required_skills: list[str]
    nice_to_have_skills: list[str]


@dataclass(frozen=True)
class QuestionToScore:
    question_id: str
    text: str
    reference_answer: str
    intent: str | None
    difficulty: str
    format: str
    skill_tags: list[str]
    transcript: str
    answered_with_hint: bool
    vacancy: VacancyContext


class LLMJudge(Protocol):
    async def judge(self, question: QuestionToScore) -> QuestionJudgment:
        ...


class DummyGPTJudge:
    """Детерминированная заглушка: считает пересечение слов эталона и транскрипта.

    Не использует LLM, поэтому подходит для тестов и первого прогона интеграции.
    """

    @staticmethod
    def _words(text: str) -> set[str]:
        return {w.lower() for w in re.findall(r"[a-zA-Zа-яА-ЯёЁ0-9]+", text)}

    def _score_by_overlap(self, reference: str, transcript: str) -> int:
        if not transcript.strip():
            return 0
        ref_words = self._words(reference)
        if not ref_words:
            return 50
        trans_words = self._words(transcript)
        matched = len(ref_words & trans_words)
        ratio = matched / len(ref_words)
        if ratio >= 0.8:
            return 90
        if ratio >= 0.6:
            return 70
        if ratio >= 0.4:
            return 50
        if ratio >= 0.2:
            return 30
        return 10

    def _quote(self, transcript: str, reference: str) -> list[str]:
        sentences = [s.strip() for s in re.split(r"[.!?]\s+", transcript) if s.strip()]
        ref_words = self._words(reference)
        for sentence in sentences:
            if ref_words & self._words(sentence):
                return [sentence]
        return sentences[:1] if sentences else []

    async def judge(self, question: QuestionToScore) -> QuestionJudgment:
        score = self._score_by_overlap(question.reference_answer, question.transcript)
        quotes = self._quote(question.transcript, question.reference_answer)
        rationale = (
            f"DummyGPT mock review: overlap-based score {score}/100 "
            f"(hint={'yes' if question.answered_with_hint else 'no'})."
        )
        if score >= 60:
            report = "Ответ покрывает основные пункты эталона."
        elif score >= 40:
            report = "Ответ частично покрывает эталон; есть пробелы."
        else:
            report = "Ответ не покрывает эталон; требуется дополнительная проверка."
        return QuestionJudgment(
            skill_scores=[
                SkillScoreResult(skill_tag=tag, score=score, rationale=rationale)
                for tag in question.skill_tags
            ],
            quotes=quotes,
            confidence=round(score / 100, 2),
            report=report,
        )


# Backward-compatible import name for existing callers and tests.
DummyLLMJudge = DummyGPTJudge


class ClaudeAgentSDKJudge:
    """Claude-оценщик через `claude-agent-sdk` (подписка, как у backend).

    Импортирует SDK лениво, чтобы не ломать импорт, если пакет не установлен.
    """

    _SYSTEM_PROMPT = """Ты — опытный технический интервьюер. Оцени ответ кандидата на вопрос собеседования.

Для каждого проверяемого навыка выставь балл 0–100 по шкале:
- 0–20: неверно / не по теме
- 21–40: очень слабо
- 41–60: неполно / неуверенно
- 61–80: корректно и уверенно
- 81–100: отлично

Верни строго JSON, соответствующий предоставленной схеме. Для каждого навыка дай rationale. Добавь report — краткий разбор ответа (что удалось, где пробелы, рекомендация). Приведи 1–2 цитаты из транскрипта, подтверждающие оценку."""

    def __init__(self, model: str | None = None) -> None:
        self.model = model or settings.llm_model

    def _build_prompt(self, question: QuestionToScore) -> str:
        return f"""Вакансия: {question.vacancy.title} ({question.vacancy.grade})
Описание вакансии: {question.vacancy.description}
Обязательные навыки: {', '.join(question.vacancy.required_skills)}
Желательные навыки: {', '.join(question.vacancy.nice_to_have_skills)}

Вопрос: {question.text}
Зачем задан (intent): {question.intent or 'не указано'}
Формат ответа: {question.format}
Сложность: {question.difficulty}
Проверяемые навыки: {', '.join(question.skill_tags)}
Эталонный ответ: {question.reference_answer}
Ответ дан с подсказкой: {'да' if question.answered_with_hint else 'нет'}

Транскрипт ответа кандидата:
---
{question.transcript}
---
"""

    async def judge(self, question: QuestionToScore) -> QuestionJudgment:
        try:
            from claude_agent_sdk import (
                AssistantMessage,
                ClaudeAgentOptions,
                ClaudeSDKClient,
                ResultMessage,
                TextBlock,
            )
        except ImportError as exc:
            raise RuntimeError(
                "claude-agent-sdk is not installed. Install it with: pip install claude-agent-sdk"
            ) from exc

        options = ClaudeAgentOptions(
            system_prompt=self._SYSTEM_PROMPT,
            model=self.model,
            tools=[],
            output_format={
                "type": "json_schema",
                "schema": QuestionJudgment.model_json_schema(),
            },
        )
        client = ClaudeSDKClient(options=options)
        await client.connect()
        try:
            await client.query(self._build_prompt(question))
            result: ResultMessage | None = None
            fallback_text = ""
            async for message in client.receive_response():
                if isinstance(message, ResultMessage):
                    result = message
                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            fallback_text += block.text
        finally:
            await client.disconnect()

        if result is None:
            raise RuntimeError(
                "Claude Agent SDK did not return ResultMessage — check `claude login`."
            )
        if result.is_error:
            raise RuntimeError(f"Claude Agent SDK returned error: {result.subtype}")

        if result.structured_output is not None:
            return QuestionJudgment.model_validate(result.structured_output)
        raw = result.result or fallback_text
        return QuestionJudgment.model_validate(json.loads(raw))


class KimiJudge:
    """Kimi evaluator via Moonshot's OpenAI-compatible Chat Completions API."""

    _API_URL = "https://api.moonshot.ai/v1/chat/completions"

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.model = model or settings.kimi_model
        self.api_key = api_key or settings.moonshot_api_key

    async def judge(self, question: QuestionToScore) -> QuestionJudgment:
        if not self.api_key:
            raise RuntimeError("MOONSHOT_API_KEY is required when EVALUATION_LLM_PROVIDER=kimi.")

        prompt = ClaudeAgentSDKJudge()._build_prompt(question)
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": ClaudeAgentSDKJudge._SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "thinking": {"type": "disabled"},
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "question_judgment",
                    "schema": QuestionJudgment.model_json_schema(),
                    "strict": True,
                },
            },
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self._API_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            response.raise_for_status()

        try:
            content = response.json()["choices"][0]["message"]["content"]
            return QuestionJudgment.model_validate_json(content)
        except (IndexError, KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("Kimi API returned an invalid structured evaluation response.") from exc


def get_judge() -> LLMJudge:
    match settings.evaluation_llm_provider:
        case "claude":
            logger.info("Using ClaudeAgentSDKJudge (model=%s)", settings.llm_model)
            return ClaudeAgentSDKJudge()
        case "kimi":
            logger.info("Using KimiJudge (model=%s)", settings.kimi_model)
            return KimiJudge()
        case "dummygpt":
            logger.info("Using DummyGPTJudge")
            return DummyGPTJudge()
        case provider:
            raise ValueError(
                f"Unsupported EVALUATION_LLM_PROVIDER={provider!r}. "
                "Use 'claude', 'kimi', or 'dummygpt'."
            )
