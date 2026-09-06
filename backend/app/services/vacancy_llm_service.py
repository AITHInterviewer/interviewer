"""LLM-генерация базовых вопросов вакансии — Anthropic Messages API через общий клиент
`app/services/llm.py`, не Claude Agent SDK CLI.

Раньше здесь был Claude Agent SDK (см. git-историю) — subprocess-харнесс, требующий
`claude login` на машине backend; на раннере деплоя такой авторизации нет. Потом был
прямой `httpx`-запрос в OpenRouter на бесплатную `minimax/minimax-m3:free` — та стабильно
отдавала 429. Теперь — платный Claude через `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY` (те же
секреты, что уже льются в `live-agent/.env` в `.github/workflows/deploy-full.yml` — нужно
передать их и в `backend/.env` тем же способом), с ретраями на 429/5xx (см. `llm.py`).

У Anthropic нет `response_format: json_object` — схема ответа просится текстом в system
prompt, `GeneratedQuestion(Set)` сами валидируют результат.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from app.models.question import Question
from app.models.vacancy import Vacancy
from app.prompts import load_prompt
from app.services.llm import AnthropicJSONClient, LLMError


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


class GeneratedSttTerms(BaseModel):
    id: str
    stt_terms: list[str] = Field(default_factory=list)


class GeneratedSttTermsSet(BaseModel):
    questions: list[GeneratedSttTerms]


_SET_SYSTEM_PROMPT = load_prompt("vacancy_question_set.txt")
_SINGLE_SYSTEM_PROMPT = load_prompt("vacancy_question_single.txt")
_STT_TERMS_SYSTEM_PROMPT = load_prompt("vacancy_stt_terms.txt")


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
    # окружение не читается в конструкторе — VacancyService создаётся заново на КАЖДЫЙ
    # запрос роутера (см. `get_vacancy_service`), в том числе для вызовов, никогда не
    # трогающих LLM (list/get/update вакансии); ключа может не быть, и это не ошибка до
    # первой реальной генерации (см. `AnthropicJSONClient`).
    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        # 180s (не дефолтные 60): генерация целого набора вопросов — самый долгий
        # LLM-вызов в backend, на медленной модели/прокси упирался в таймаут.
        self._llm = AnthropicJSONClient(model=model, api_key=api_key, timeout=180.0)

    async def _complete(self, system_prompt: str, user_prompt: str) -> str:
        try:
            return await self._llm.complete(
                system_prompt, user_prompt, temperature=0.5, max_tokens=8192
            )
        except LLMError as exc:
            raise QuestionGenerationError(str(exc)) from exc

    async def generate_questions(self, vacancy: Vacancy) -> GeneratedQuestionSet:
        raw = await self._complete(_SET_SYSTEM_PROMPT, _vacancy_prompt(vacancy))
        try:
            return GeneratedQuestionSet.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001 — любая ошибка парсинга/валидации сворачивается в наш тип
            raise QuestionGenerationError(f"Не удалось разобрать сгенерированные вопросы: {exc}") from exc

    async def generate_stt_terms(
        self, vacancy: Vacancy, questions: list[Question]
    ) -> dict[str, list[str]]:
        """Термины-подсказки ASR для каждого вопроса — см. `vacancy_stt_terms.txt`.
        Возвращает `{question_id: [term, ...]}`; отсутствующие/пустые ключи — норма."""
        if not questions:
            return {}
        blocks = [
            f"[{q.id}] role={q.role}\n"
            f"Вопрос: {q.text}\n"
            f"Что проверяет: {q.intent or '(не указано)'}\n"
            f"Эталонный ответ: {q.reference_answer or '(не указан)'}"
            for q in questions
        ]
        user_prompt = _vacancy_prompt(vacancy) + "\nВопросы:\n" + "\n\n".join(blocks)
        raw = await self._complete(_STT_TERMS_SYSTEM_PROMPT, user_prompt)
        try:
            parsed = GeneratedSttTermsSet.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001
            raise QuestionGenerationError(f"Не удалось разобрать термины ASR: {exc}") from exc
        return {item.id: item.stt_terms for item in parsed.questions if item.stt_terms}

    async def generate_single_question(self, vacancy: Vacancy, existing: Question) -> GeneratedQuestion:
        prompt = _vacancy_prompt(vacancy) + f'Исходный вопрос (role="{existing.role}"): {existing.text}\n'
        raw = await self._complete(_SINGLE_SYSTEM_PROMPT, prompt)
        try:
            return GeneratedQuestion.model_validate(json.loads(_strip_code_fence(raw)))
        except Exception as exc:  # noqa: BLE001
            raise QuestionGenerationError(f"Не удалось разобрать сгенерированный вопрос: {exc}") from exc
