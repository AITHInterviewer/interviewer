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


_SET_SCHEMA_HINT = """

Ответь СТРОГО одним JSON-объектом, без markdown-обёртки (```), без текста до или после \
JSON, ровно с такими полями:
{"questions": [
  {"text": "...", "role": "warmup"|"assessment"|"closing", "skill_tag": ["..."], \
"intent": "..."|null, "reference_answer": "..."|null, "format": "voice", \
"difficulty": "baseline"|"stretch", "estimated_duration_sec": 180}
]}
Ровно 6 вопросов в массиве: 1 warmup, 4 assessment, 1 closing (в этом порядке или любом —
роль в каждом объекте обязательна)."""

_SET_SYSTEM_PROMPT = """Ты помогаешь рекрутёру составить базовый набор вопросов для \
технического собеседования на вакансию. ВСЕ вопросы без исключения — строго технические, \
по существу вакансии и её навыков. Никакой светской беседы и общих вопросов про личность/\
мотивацию/soft skills ("расскажите о себе", "почему хотите у нас работать", "есть ли вопросы \
к нам" и т.п.) — это НЕ техническое интервью, а собеседование по технической части. \
Сгенерируй ровно 6 вопросов на русском языке:
- 1 вопрос с role="warmup" — короткий, но всё равно технический разогревающий вопрос по одному \
из навыков вакансии (например, попросить кратко описать разницу двух связанных понятий), без \
intent/reference_answer/skill_tag;
- 4 вопроса с role="assessment" — для каждого ОБЯЗАТЕЛЬНО заполни непустые intent \
(что именно проверяет вопрос), reference_answer (эталонный ответ для оценки) и \
skill_tag (список навыков из требований вакансии, минимум один тег). Навыки (skill_tag) этих \
4 вопросов ВМЕСТЕ ДОЛЖНЫ ПОКРЫТЬ КАЖДЫЙ обязательный навык вакансии хотя бы одним вопросом — \
если обязательных навыков больше 4, задай на один вопрос несколько связанных навыков \
(skill_tag может содержать больше одного тега), но не оставляй ни один навык без вопроса;
- 1 вопрос с role="closing" — короткий, но тоже технический завершающий вопрос (например, про \
границы применимости одного из обсуждённых подходов), без intent/reference_answer/skill_tag.

Для всех вопросов: format="voice", difficulty — смешивай "baseline"/"stretch", \
estimated_duration_sec — целое число от 120 до 240. Верни только вопросы, соответствующие \
описанию вакансии и её required/nice-to-have навыкам.""" + _SET_SCHEMA_HINT

_SINGLE_SCHEMA_HINT = """

Ответь СТРОГО одним JSON-объектом, без markdown-обёртки (```), без текста до или после \
JSON, ровно с такими полями:
{"text": "...", "role": "warmup"|"assessment"|"closing", "skill_tag": ["..."], \
"intent": "..."|null, "reference_answer": "..."|null, "format": "voice", \
"difficulty": "baseline"|"stretch", "estimated_duration_sec": 180}"""

_SINGLE_SYSTEM_PROMPT = """Ты помогаешь рекрутёру переформулировать один вопрос для \
собеседования на вакансию. Сгенерируй ОДИН новый вопрос взамен старого, той же роли (role), \
что и исходный вопрос:
- если role="assessment" — ОБЯЗАТЕЛЬНО заполни непустые intent, reference_answer и skill_tag \
(список навыков из требований вакансии, минимум один тег);
- если role="warmup"/"closing" — оставь intent/reference_answer/skill_tag пустыми.

Новый вопрос должен проверять то же самое, но другими словами/с другим фокусом — не повторяй \
исходную формулировку дословно. format="voice", estimated_duration_sec — целое число от 120 до 240.""" + _SINGLE_SCHEMA_HINT


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
