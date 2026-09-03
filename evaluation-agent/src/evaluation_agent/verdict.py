"""Правило вынесения вердикта — раздел 5.1 архитектурного документа, реализовано 1 в 1.

Единственная часть evaluation-agent, которая не зависит от внешней инфраструктуры (ASR/
LLM/очередь) — чистая функция от уже посчитанных `skill_scores`, поэтому полностью
протестирована (см. tests/test_verdict.py) без моков и без сети.
"""

from __future__ import annotations

from collections import defaultdict

from .schema import Difficulty, QuestionScore, SkillClass, SkillVerdict, Verdict

FAIL_THRESHOLD = 40  # score < 40 -> fail
PASS_THRESHOLD = 60  # score >= 60 -> pass; между ними -> ambiguous
HINT_SCORE_CAP = 60  # answered_with_hint=true -> effective score не выше этого


def _effective_score(qs: QuestionScore) -> int:
    """Штраф за подсказку — раздел 5.1: «ответ с подсказкой не может засчитаться как
    уверенное самостоятельное владение навыком», сколько бы ни поставил оценщик."""
    return min(qs.score, HINT_SCORE_CAP) if qs.answered_with_hint else qs.score


def _classify(score: int) -> SkillClass:
    if score < FAIL_THRESHOLD:
        return SkillClass.FAIL
    if score < PASS_THRESHOLD:
        return SkillClass.AMBIGUOUS
    return SkillClass.PASS_


def aggregate_skills(
    scores: list[QuestionScore],
    required_skills: set[str],
) -> list[SkillVerdict]:
    """Группирует skill_scores по skill_tag и классифицирует каждый навык.

    Обязательный навык — минимум по baseline-вопросам (stretch не участвует в минимуме,
    только даёт бонус при успехе). Дополнительный/общий — среднее по baseline. Раздел 5.1.
    """
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
    """Приоритет сверху вниз — раздел 5.1:
    1. хоть один обязательный навык fail -> не подходит
    2. есть противоречие -> требуется доп. проверка (не может быть «подходит»)
    3. хоть один обязательный навык ambiguous/untested -> требуется доп. проверка
    4. иначе -> подходит
    """
    required = [v for v in skill_verdicts if v.required]

    if any(v.skill_class == SkillClass.FAIL for v in required):
        return Verdict.NOT_FITS

    if has_contradictions:
        return Verdict.NEEDS_REVIEW

    if any(v.skill_class in (SkillClass.AMBIGUOUS, SkillClass.UNTESTED) for v in required):
        return Verdict.NEEDS_REVIEW

    return Verdict.FITS
