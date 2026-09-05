"""LLM-генерация базовых вопросов вакансии — Claude Agent SDK на подписке (решение
пользователя, см. план: не Anthropic Messages API/API-ключ, тот же пакет и паттерн, что
`live-agent/src/ainterviewer/llm_client.py:77-127`).

Один вызов (connect → query → disconnect), без переиспользования сессии между вызовами —
в отличие от `live-agent`, здесь нет цикла "много ходов на один вопрос", каждая генерация
вакансии независима.
"""

from __future__ import annotations

import json
import os

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
)
from pydantic import BaseModel, Field

from app.models.vacancy import Vacancy

DEFAULT_MODEL = "claude-sonnet-5"

_SYSTEM_PROMPT = """Ты помогаешь рекрутёру составить базовый набор вопросов для \
собеседования на вакансию. Сгенерируй ровно 6 вопросов на русском языке:
- 1 вопрос с role="warmup" (короткий разогревающий вопрос, без intent/reference_answer/skill_tag);
- 4 вопроса с role="assessment" — для каждого ОБЯЗАТЕЛЬНО заполни непустые intent \
(что именно проверяет вопрос), reference_answer (эталонный ответ для оценки) и \
skill_tag (список навыков из требований вакансии, минимум один тег);
- 1 вопрос с role="closing" (короткий завершающий вопрос, без intent/reference_answer/skill_tag).

Для всех вопросов: format="voice", difficulty — смешивай "baseline"/"stretch", \
estimated_duration_sec — целое число от 120 до 240. Верни только вопросы, соответствующие \
описанию вакансии и её required/nice-to-have навыкам."""


class QuestionGenerationError(Exception):
    """LLM не вернул валидный набор вопросов (ошибка SDK/CLI или невалидный ответ)."""


class GeneratedQuestion(BaseModel):
    text: str = Field(min_length=1)
    role: str = "assessment"
    skill_tag: list[str] = Field(default_factory=list)
    intent: str | None = None
    reference_answer: str | None = None
    format: str = "voice"
    difficulty: str = "baseline"
    estimated_duration_sec: int = Field(gt=0)


class GeneratedQuestionSet(BaseModel):
    questions: list[GeneratedQuestion]


class VacancyLLMService:
    def __init__(self, model: str | None = None) -> None:
        self.model = model or os.environ.get("LLM_MODEL", DEFAULT_MODEL)

    async def generate_questions(self, vacancy: Vacancy) -> GeneratedQuestionSet:
        options = ClaudeAgentOptions(
            system_prompt=_SYSTEM_PROMPT,
            model=self.model,
            tools=[],
            output_format={
                "type": "json_schema",
                "schema": GeneratedQuestionSet.model_json_schema(),
            },
        )
        client = ClaudeSDKClient(options=options)
        await client.connect()
        try:
            prompt = (
                f"Вакансия: {vacancy.title}\n"
                f"Грейд: {vacancy.grade}\n"
                f"Описание: {vacancy.description}\n"
                f"Обязательные навыки: {', '.join(vacancy.required_skills) or '(не указаны)'}\n"
                f"Желательные навыки: {', '.join(vacancy.nice_to_have_skills) or '(не указаны)'}\n"
            )
            await client.query(prompt)

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
            raise QuestionGenerationError(
                "Claude Agent SDK не вернул ResultMessage — проверьте авторизацию (claude login)."
            )
        if result.is_error:
            raise QuestionGenerationError(f"Claude Agent SDK вернул ошибку: {result.subtype}")

        try:
            if result.structured_output is not None:
                return GeneratedQuestionSet.model_validate(result.structured_output)
            raw = result.result or fallback_text
            return GeneratedQuestionSet.model_validate(json.loads(raw))
        except Exception as exc:  # noqa: BLE001 — любая ошибка парсинга/валидации сворачивается в наш тип
            raise QuestionGenerationError(f"Не удалось разобрать сгенерированные вопросы: {exc}") from exc
