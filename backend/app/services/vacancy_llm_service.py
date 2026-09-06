"""LLM-генерация базовых вопросов вакансии — OpenRouter (OpenAI-совместимый
`/chat/completions`), не Claude Agent SDK CLI.

Раньше здесь был Claude Agent SDK (см. git-историю) — тот же subprocess-харнесс, что и
`live-agent/src/ainterviewer/llm_client.py:ClaudeAgentSDKLiveControlLLM`, требует
`claude login` на машине, где крутится backend; на раннере деплоя такой авторизации нет,
и генерация вопросов падала. `live-agent` уже решал ровно эту же проблему через прямой
`httpx`-запрос к OpenAI-совместимому эндпоинту (см. `_OpenAICompatibleLiveControlLLM` в
`llm_client.py`) — здесь тот же паттерн: один stateless POST, без подпроцесса и без
интерактивного логина, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` из окружения (тот же секрет,
что уже льётся в `live-agent/.env` в `.github/workflows/deploy-full.yml` — нужно передать
его и в `backend/.env` тем же способом).

`response_format: json_object` (в отличие от `output_format` Claude Agent SDK) не принимает
JSON-схему — схема ответа добавляется текстом в system prompt, `GeneratedQuestion(Set)`
сами валидируют результат.
"""

from __future__ import annotations

import json
import os

import httpx
from pydantic import BaseModel, Field

from app.models.question import Question
from app.models.vacancy import Vacancy
from app.prompts import load_prompt

DEFAULT_MODEL = "minimax/minimax-m3:free"
BASE_URL = "https://openrouter.ai/api/v1/chat/completions"


class QuestionGenerationError(Exception):
    """LLM не вернул валидный набор вопросов (сетевая ошибка/невалидный ответ)."""


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


_SET_SYSTEM_PROMPT = load_prompt("vacancy_question_set.txt")
_SINGLE_SYSTEM_PROMPT = load_prompt("vacancy_question_single.txt")


def _vacancy_prompt(vacancy: Vacancy) -> str:
    return (
        f"Вакансия: {vacancy.title}\n"
        f"Грейд: {vacancy.grade}\n"
        f"Описание: {vacancy.description}\n"
        f"Обязательные навыки: {', '.join(vacancy.required_skills) or '(не указаны)'}\n"
        f"Желательные навыки: {', '.join(vacancy.nice_to_have_skills) or '(не указаны)'}\n"
    )


def _strip_code_fence(raw: str) -> str:
    """Некоторые модели всё равно оборачивают JSON в ```json ... ``` вопреки просьбе —
    снимаем обёртку перед парсингом, а не падаем молча."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text.removeprefix("```")
        if text.endswith("```"):
            text = text[: -len("```")]
    return text.strip()


class VacancyLLMService:
    # `api_key` не читается в конструкторе (в отличие от MistralLiveControlLLM/
    # OpenRouterLiveControlLLM в live-agent) — VacancyService создаётся заново на КАЖДЫЙ
    # запрос роутера (см. `get_vacancy_service`), в том числе для вызовов, никогда не
    # трогающих LLM (list/get/update вакансии). Реальный найденный баг: с eager-чтением
    # `os.environ["OPENROUTER_API_KEY"]` в __init__ любой такой запрос падал бы с
    # KeyError, если ключ не задан — вместо этого падаем только при попытке
    # сгенерировать вопросы.
    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.model = model or os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=60.0)

    async def _complete(self, system_prompt: str, user_prompt: str) -> str:
        api_key = self._api_key or os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise QuestionGenerationError(
                "OPENROUTER_API_KEY не задан — генерация вопросов недоступна."
            )
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
                    "temperature": 0.5,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise QuestionGenerationError(f"OpenRouter недоступен: {exc}") from exc

        payload = response.json()
        try:
            return payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise QuestionGenerationError(f"OpenRouter вернул неожиданный ответ: {payload}") from exc

    async def generate_questions(self, vacancy: Vacancy) -> GeneratedQuestionSet:
        raw = await self._complete(_SET_SYSTEM_PROMPT, _vacancy_prompt(vacancy))
        try:
            return GeneratedQuestionSet.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001 — любая ошибка парсинга/валидации сворачивается в наш тип
            raise QuestionGenerationError(f"Не удалось разобрать сгенерированные вопросы: {exc}") from exc

    async def generate_single_question(self, vacancy: Vacancy, existing: Question) -> GeneratedQuestion:
        prompt = _vacancy_prompt(vacancy) + f'Исходный вопрос (role="{existing.role}"): {existing.text}\n'
        raw = await self._complete(_SINGLE_SYSTEM_PROMPT, prompt)
        try:
            return GeneratedQuestion.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001
            raise QuestionGenerationError(f"Не удалось разобрать сгенерированный вопрос: {exc}") from exc
