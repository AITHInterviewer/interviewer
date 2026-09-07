"""LLM-судья: по вопросу + эталону + транскрипту выдаёт QuestionScore и report.

Реализации:
- `DummyGPTJudge` — детерминированный mock review для тестов/локальной разработки.
- `ClaudeAgentSDKJudge` — Claude через `claude-agent-sdk` (тот же подход, что
  `backend/app/services/vacancy_llm_service.py`).
- `KimiJudge` — Kimi через OpenAI-совместимый Moonshot Chat Completions API.
- `OpenRouterJudge` — LLM-шлюз прод-деплоя (OpenAI-совместимый chat/completions,
  паттерн backend-овского `OpenRouterJSONClient`).

Интерфейс единый, чтобы воркер не зависел от провайдера.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import ClassVar, Protocol

import httpx
from pydantic import BaseModel, Field

from evaluation_agent.config import settings

logger = logging.getLogger(__name__)


class SkillScoreResult(BaseModel):
    skill_tag: str
    score: int = Field(..., ge=0, le=3)
    rationale: str = Field(description="Краткое обоснование уровня в 1–2 предложениях: главный аргумент, почему поставлен именно такой уровень. Без пересказа ответа.")


class QuestionJudgment(BaseModel):
    skill_scores: list[SkillScoreResult]
    quotes: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
    report: str | None = Field(default=None, description="Краткий разбор ответа: что удалось, где пробелы, рекомендация.")


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
    async def judge(self, question: QuestionToScore) -> QuestionJudgment: ...


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
            return 3
        if ratio >= 0.5:
            return 2
        if ratio >= 0.2:
            return 1
        return 0

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
            f"DummyGPT mock review: overlap-based score {score}/3 "
            f"(hint={'yes' if question.answered_with_hint else 'no'})."
        )
        if score >= 2:
            report = "Ответ покрывает основные пункты эталона."
        elif score >= 1:
            report = "Ответ частично покрывает эталон; есть пробелы."
        else:
            report = "Ответ не покрывает эталон; требуется дополнительная проверка."
        return QuestionJudgment(
            skill_scores=[
                SkillScoreResult(skill_tag=tag, score=score, rationale=rationale)
                for tag in question.skill_tags
            ],
            quotes=quotes,
        confidence=round(score / 3, 2),
            report=report,
        )


# Backward-compatible import name for existing callers and tests.
DummyLLMJudge = DummyGPTJudge


class ClaudeAgentSDKJudge:
    """Claude-оценщик через `claude-agent-sdk` (подписка, как у backend).

    Импортирует SDK лениво, чтобы не ломать импорт, если пакет не установлен.
    """

    _SYSTEM_PROMPT = """Ты — опытный технический интервьюер. Оцени ответ кандидата на вопрос собеседования.

Для каждого проверяемого навыка выставь уровень 0–3:
- 0: навыка не видно в ответе
- 1: базовый уровень
- 2: средний уровень
- 3: продвинутый уровень

Оцени относительно грейда вакансии: продвинутый уровень для junior соответствует
базовому уровню для middle, а продвинутый для middle — базовому для senior. Не
завышай уровень только из-за терминов без объяснения механики.

Верни строго JSON, соответствующий предоставленной схеме. Для каждого навыка дай
rationale — 1–2 предложения с главным аргументом для поставленного уровня, не
пересказывай ответ. Добавь report — краткий разбор ответа (что удалось, где пробелы,
рекомендация). Приведи 1–2 цитаты из транскрипта, подтверждающие оценку."""

    def __init__(self, model: str | None = None) -> None:
        self.model = model or settings.llm_model

    def _build_prompt(self, question: QuestionToScore) -> str:
        return f"""Вакансия: {question.vacancy.title} ({question.vacancy.grade})
Описание вакансии: {question.vacancy.description}
Обязательные навыки: {", ".join(question.vacancy.required_skills)}
Желательные навыки: {", ".join(question.vacancy.nice_to_have_skills)}

Вопрос: {question.text}
Зачем задан (intent): {question.intent or "не указано"}
Формат ответа: {question.format}
Сложность: {question.difficulty}
Проверяемые навыки: {", ".join(question.skill_tags)}
Эталонный ответ: {question.reference_answer}
Ответ дан с подсказкой: {"да" if question.answered_with_hint else "нет"}

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
            raise RuntimeError("Claude Agent SDK did not return ResultMessage — check `claude login`.")
        if result.is_error:
            raise RuntimeError(f"Claude Agent SDK returned error: {result.subtype}")

        if result.structured_output is not None:
            return QuestionJudgment.model_validate(result.structured_output)
        raw = result.result or fallback_text
        return QuestionJudgment.model_validate(json.loads(raw))


class OpenRouterJudge:
    """Оценка через OpenRouter (OpenAI-совместимый chat/completions).

    Прод-деплой использует OpenRouter как единый LLM-шлюз (тот же ключ, что
    live-контур и генерация вопросов в backend, см. backend/app/services/llm.py).
    Паттерн сознательно повторяет backend-овский `OpenRouterJSONClient`: схема
    просится текстом в промпте, ответ валидируется pydantic'ом, ретраи на
    429/5xx — Moonshot-специфичные поля (`thinking`, `response_format.json_schema`)
    сюда не передаём, OpenRouter их для gemini-2.5-flash не принимает.
    """

    _DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
    _MAX_ATTEMPTS = 4
    _RETRY_STATUS: ClassVar[set[int]] = {429, 500, 502, 503, 529}
    _MAX_BACKOFF_SEC = 30.0

    def __init__(self, model: str | None = None, api_key: str | None = None, base_url: str | None = None) -> None:
        self.model = model or settings.openrouter_model
        self.api_key = api_key or settings.openrouter_api_key
        self.base_url = (base_url or settings.openrouter_base_url or self._DEFAULT_BASE_URL).rstrip("/")

    @staticmethod
    def _backoff_seconds(response: httpx.Response | None, attempt: int) -> float:
        if response is not None:
            try:
                return min(float(response.headers["retry-after"]), OpenRouterJudge._MAX_BACKOFF_SEC)
            except (KeyError, ValueError):
                pass
        return min(2.0**attempt, OpenRouterJudge._MAX_BACKOFF_SEC)

    @staticmethod
    def _parse_judgment(content: str) -> QuestionJudgment:
        """Модель просили ответить JSON-объектом; на практике оборачивает в маркдаун —
        пробуем целиком, потом первый {...}-блок."""
        try:
            return QuestionJudgment.model_validate_json(content)
        except ValueError:
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end > start:
                return QuestionJudgment.model_validate_json(content[start : end + 1])
            raise RuntimeError(f"OpenRouter returned a non-JSON judgment: {content[:200]!r}")

    async def judge(self, question: QuestionToScore) -> QuestionJudgment:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required when EVALUATION_LLM_PROVIDER=openrouter.")

        prompt = ClaudeAgentSDKJudge()._build_prompt(question)
        body = {
            "model": self.model,
            "max_tokens": 4096,
            # Оценка должна быть воспроизводимой (тот же аргумент, что temperature=0
            # у KimiJudge): без явной температуры провайдер сэмплирует.
            "temperature": 0,
            "messages": [
                {"role": "system", "content": ClaudeAgentSDKJudge._SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }

        last_error: Exception | None = None
        for attempt in range(self._MAX_ATTEMPTS):
            if attempt:
                await asyncio.sleep(self._backoff_seconds(getattr(last_error, "response", None), attempt))
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "HTTP-Referer": "https://github.com/AITHInterviewer/interviewer",
                            "X-Title": "ainterviewer",
                        },
                        json=body,
                    )
                    response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code in self._RETRY_STATUS:
                    continue
                raise RuntimeError(
                    f"OpenRouter returned {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.HTTPError as exc:
                last_error = exc
                continue

            content = response.json()["choices"][0]["message"]["content"]
            return self._parse_judgment(content)

        raise RuntimeError(f"OpenRouter unavailable after {self._MAX_ATTEMPTS} attempts: {last_error}")


class KimiJudge:
    """Kimi evaluator via Moonshot's OpenAI-compatible Chat Completions API."""

    _DEFAULT_API_URL = "https://api.moonshot.ai/v1/chat/completions"

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.model = model or settings.kimi_model
        self.api_key = api_key or settings.moonshot_api_key
        # Переопределяется, если ключ выдан прокси/агрегатором (как ANTHROPIC_BASE_URL
        # у live-agent): официальные ключи .ai/.cn между собой несовместимы.
        self.api_url = settings.kimi_base_url or self._DEFAULT_API_URL

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
            # Оценка должна быть воспроизводимой: без явной температуры провайдер
            # сэмплирует, и уровни «прыгают» между прогонами одного интервью.
            "temperature": 0,
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
                self.api_url,
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
        case "openrouter":
            logger.info("Using OpenRouterJudge (model=%s)", settings.openrouter_model)
            return OpenRouterJudge()
        case "dummygpt":
            logger.info("Using DummyGPTJudge")
            return DummyGPTJudge()
        case provider:
            raise ValueError(
                f"Unsupported EVALUATION_LLM_PROVIDER={provider!r}. "
                "Use 'claude', 'kimi', 'openrouter', or 'dummygpt'."
            )
