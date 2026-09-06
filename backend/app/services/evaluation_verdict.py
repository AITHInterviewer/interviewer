"""Правило вынесения вердикта — копия 1:1 `evaluation-agent/src/evaluation_agent/{schema,verdict}.py`.

Не импортируем evaluation-agent как пакет: backend и evaluation-agent — разные Docker build
context'ы (`backend/Dockerfile` копирует только `backend/`, репозиторий-сосед недоступен
в образе), а сам evaluation-agent пока не собирается как устанавливаемый пакет (нет
`[build-system]` в его pyproject.toml). Копия — сознательный компромисс на MVP; если/когда
появится общий асинхронный batch-контур (см. `evaluation-agent/src/evaluation_agent/worker.py`),
имеет смысл вынести это в shared-пакет и удалить дублирование здесь.

Отличие от оригинала: шкала `score` — не 0-100, а 1-5 с фиксированными якорями (см.
`app/prompts/evaluation_answer_score.txt`) — по запросу «более формально оценивать», не
абстрактные 0-100 из головы модели. Пороги ниже пересчитаны под эту шкалу: 1 = fail,
2 = ambiguous, 3-5 = pass — сохраняет ту же семантику, что была на 0-100 (fail < 40,
pass >= 60), просто в целых баллах 1-5.
"""

from __future__ import annotations

from collections import defaultdict
from enum import Enum

from pydantic import BaseModel

FAIL_THRESHOLD = 2  # score < 2 -> fail (только score=1)
PASS_THRESHOLD = 3  # score >= 3 -> pass; score=2 -> ambiguous
HINT_SCORE_CAP = 2  # answered_with_hint=true -> effective score не выше этого (не может стать pass)


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
    """Один элемент `skill_scores[]` — оценка одного (вопрос, навык)."""

    skill_tag: str
    score: int  # 1-5, см. app/prompts/evaluation_answer_score.txt
    difficulty: Difficulty = Difficulty.BASELINE
    answered_with_hint: bool = False


class SkillVerdict(BaseModel):
    skill_tag: str
    required: bool
    skill_class: SkillClass
    effective_score: int | None  # None только для UNTESTED
    stretch_bonus: bool


def _effective_score(qs: QuestionScore) -> int:
    return min(qs.score, HINT_SCORE_CAP) if qs.answered_with_hint else qs.score


def _classify(score: int) -> SkillClass:
    if score < FAIL_THRESHOLD:
        return SkillClass.FAIL
    if score < PASS_THRESHOLD:
        return SkillClass.AMBIGUOUS
    return SkillClass.PASS_


def aggregate_skills(scores: list[QuestionScore], required_skills: set[str]) -> list[SkillVerdict]:
    by_skill: dict[str, list[QuestionScore]] = defaultdict(list)
    for qs in scores:
        by_skill[qs.skill_tag].append(qs)

    verdicts: list[SkillVerdict] = []
    for skill_tag, qs_list in by_skill.items():
        required = skill_tag in required_skills
        baseline = [qs for qs in qs_list if qs.difficulty == Difficulty.BASELINE]
        stretch = [qs for qs in qs_list if qs.difficulty == Difficulty.STRETCH]
        stretch_bonus = any(_effective_score(qs) >= PASS_THRESHOLD for qs in stretch)

        if not baseline:
            verdicts.append(
                SkillVerdict(
                    skill_tag=skill_tag,
                    required=required,
                    skill_class=SkillClass.UNTESTED,
                    effective_score=None,
                    stretch_bonus=stretch_bonus,
                )
            )
            continue

        effective_scores = [_effective_score(qs) for qs in baseline]
        agg = min(effective_scores) if required else round(sum(effective_scores) / len(effective_scores))
        verdicts.append(
            SkillVerdict(
                skill_tag=skill_tag,
                required=required,
                skill_class=_classify(agg),
                effective_score=agg,
                stretch_bonus=stretch_bonus,
            )
        )

    for skill_tag in required_skills:
        if skill_tag not in by_skill:
            verdicts.append(
                SkillVerdict(
                    skill_tag=skill_tag,
                    required=True,
                    skill_class=SkillClass.UNTESTED,
                    effective_score=None,
                    stretch_bonus=False,
                )
            )

    return verdicts


def compute_verdict(skill_verdicts: list[SkillVerdict], has_contradictions: bool) -> Verdict:
    required = [v for v in skill_verdicts if v.required]

    if any(v.skill_class == SkillClass.FAIL for v in required):
        return Verdict.NOT_FITS

    if has_contradictions:
        return Verdict.NEEDS_REVIEW

    if any(v.skill_class in (SkillClass.AMBIGUOUS, SkillClass.UNTESTED) for v in required):
        return Verdict.NEEDS_REVIEW

    return Verdict.FITS
