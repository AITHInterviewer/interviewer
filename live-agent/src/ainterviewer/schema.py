"""
Типы данных live-контура.

Два независимых блока:
1) Входные данные интервью (замокан JSON: вакансия + вопросы + резюме) — см. docs/Архитектура и дизайн MVP.md, раздел 4.
2) Выход LLM на каждом шаге реактивного цикла (раздел 2.3, шаг 5 / 2.3.1 архитектурного документа) — строго типизированный,
   парсится как structured output, не свободный текст.

Важно: `LiveControlDecision` — единственное место, где LLM влияет на граф. Сам граф (какое состояние наступит дальше)
считает `state_machine.py` в коде, а не LLM через tool-calling — см. README, раздел "Почему без тулов".
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# Входные данные интервью (мок)
# --------------------------------------------------------------------------


class QuestionDifficulty(str, Enum):
    BASELINE = "baseline"
    STRETCH = "stretch"


class Question(BaseModel):
    """Один вопрос вакансии.

    `rubric_notes` — то, что в задаче названо «методичка для ИИ»: не сам эталонный ответ,
    а инструкция агенту, на что именно обращать внимание при оценке и при генерации уточнений
    (что критично, какие типичные ошибки, где проходит грань между «неполно» и «неверно» для
    именно этого вопроса). Это отдельное поле от `reference_answer`, потому что эталонный ответ —
    то, ЧТО должно прозвучать, а `rubric_notes` — то, КАК это оценивать и на что давить в уточнениях.
    """

    id: str
    text: str
    skill_tag: list[str] = Field(default_factory=list)
    intent: str
    reference_answer: str
    rubric_notes: str = ""
    difficulty: QuestionDifficulty = QuestionDifficulty.BASELINE


class Vacancy(BaseModel):
    title: str
    grade: str
    description: str = ""
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)


class Candidate(BaseModel):
    name: str
    resume_text: str = ""
    # Резюме сознательно НЕ подмешивается в контекст live-контура в этой версии —
    # см. README: контекст = только текущий вопрос. Поле хранится для batch-контура
    # и для будущего resume_inspired-триггера (раздел 2.3.1 архитектурного документа).


class InterviewInput(BaseModel):
    """Замоканный вход агента — весь файл mock_data/*.json грузится в эту модель."""

    interview_id: str
    vacancy: Vacancy
    candidate: Candidate
    questions: list[Question]


# --------------------------------------------------------------------------
# Выход LLM на каждом шаге реактивного цикла
# --------------------------------------------------------------------------


class Decision(str, Enum):
    """Четырёхклассовая классификация из раздела 2.3.1 архитектурного документа."""

    CONTINUE = "continue"  # пауза — не конец мысли, ничего не говорим (кроме бэкчаннела)
    EXHAUSTIVE = "exhaustive"  # ответ исчерпывающий — переходим дальше
    AMBIGUOUS = "ambiguous"  # неясно, закончил ли — чек-ин
    GAP = "gap"  # чёткий пробел — адаптивный вопрос


class GapType(str, Enum):
    """Подмножество типов адаптивных вопросов из раздела 2.3.1.

    В этой версии сознательно НЕ реализованы contradiction_check и resume_inspired —
    оба требуют контекста шире одного вопроса (историю всех ответов и резюме
    соответственно), а по требованию контекст live-контура ограничен текущим
    вопросом. Возвращать эти два триггера будет следующая итерация, когда
    появится batch-контур с полной историей интервью.
    """

    CLARIFICATION = "clarification"
    LEADING_HINT = "leading_hint"
    DRILL_DOWN = "drill_down"


class LiveControlDecision(BaseModel):
    """Structured output одного вызова LLM в реактивном цикле.

    Один вызов — одно решение: либо промолчать/продолжить слушать, либо сказать что-то
    одно (чек-ин, адаптивный вопрос, или связку перед переходом). Совмещено в один вызов
    (классификация + текст реплики), чтобы не делать два последовательных LLM-запроса на
    каждую паузу — раздел 9.2/раздел 3 архитектурного документа явно требуют бюджет по
    времени в единицы секунд.
    """

    decision: Decision
    gap_type: GapType | None = None
    utterance: str | None = Field(
        default=None,
        description="Что сказать кандидату следующим. None при decision=continue.",
    )
    reasoning: str = Field(
        default="",
        description="Короткое обоснование для протокола событий и отладки, кандидату не показывается.",
    )
