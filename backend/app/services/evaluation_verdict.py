"""Правило вынесения вердикта — копия 1:1 `evaluation-agent/src/evaluation_agent/{schema,verdict}.py`.

Не импортируем evaluation-agent как пакет: backend и evaluation-agent — разные Docker build
context'ы (`backend/Dockerfile` копирует только `backend/`, репозиторий-сосед недоступен
в образе), а сам evaluation-agent пока не собирается как устанавливаемый пакет (нет
`[build-system]` в его pyproject.toml). Копия — сознательный компромисс на MVP; если/когда
появится общий асинхронный batch-контур (см. `evaluation-agent/src/evaluation_agent/worker.py`),
имеет смысл вынести это в shared-пакет и удалить дублирование здесь.

Единственное отличие от оригинала: пороги/имена не меняли, только модуль/докстринг.
"""

from __future__ import annotations

from collections import defaultdict
from enum import Enum

from pydantic import BaseModel

FAIL_THRESHOLD = 40  # score < 40 -> fail
PASS_THRESHOLD = 60  # score >= 60 -> pass; между ними -> ambiguous
HINT_SCORE_CAP = 60  # answered_with_hint=true -> effective score не выше этого


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
    score: int  # 0-100
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
