"""Типы для правила вердикта — раздел 5.1 `docs/Архитектура и дизайн MVP.md`.

Соответствуют полям `Evaluation`/`Question` из `backend/app/models.py`, но это
самостоятельные Pydantic-модели (не импортируем ORM отсюда) — evaluation-agent и backend
разные деплойменты, зависимость должна идти через API/очередь, не через общий код ORM.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class Difficulty(str, Enum):
    BASELINE = "baseline"
    STRETCH = "stretch"


class SkillClass(str, Enum):
    FAIL = "fail"
    AMBIGUOUS = "ambiguous"
    PASS_ = "pass"
    UNTESTED = "untested"


class Verdict(str, Enum):
    FITS = "fits"
    NOT_FITS = "not_fits"
    NEEDS_REVIEW = "needs_review"


class QuestionScore(BaseModel):
    """Один элемент `skill_scores[]` внутри `per_question` — раздел 4/5.1."""

    skill_tag: str
    score: int  # 0-100, см. якоря шкалы в разделе 5.1
    difficulty: Difficulty = Difficulty.BASELINE
    answered_with_hint: bool = False


class SkillVerdict(BaseModel):
    """Промежуточный результат агрегации по одному навыку — не персистится напрямую,
    но полезен в отчёте (`intent` почему навык получил такую классификацию)."""

    skill_tag: str
    required: bool
    skill_class: SkillClass
    effective_score: int | None  # None только для UNTESTED
    stretch_bonus: bool  # хотя бы один stretch-вопрос по навыку пройден успешно (>=60)
