"""Единая взвешенная шкала интервью, независимая от LLM-вердикта."""

from __future__ import annotations

from dataclasses import dataclass

from evaluation_agent.schema import Verdict


@dataclass(frozen=True)
class InterviewScore:
    question_score: float
    skill_score: float
    max_score: float
    score_percent: int
    skill_levels: list[dict[str, int | str]]
    verdict: Verdict


def calculate_interview_score(
    *,
    question_ids: list[str],
    skill_scores_by_question: dict[str, list[tuple[str, int]]],
    required_skills: list[str],
    nice_to_have_skills: list[str],
    has_contradictions: bool,
) -> InterviewScore:
    """Считает балл кандидата по фиксированной шкале вакансии.

    Один вопрос даёт максимум 3 балла. Уровень навыка (0..3) берётся как средний
    балл по вопросам навыка; его вклад нормируется до веса навыка, чтобы максимум
    не зависел от количества вопросов, которыми навык проверяли.

    Вопрос без единого оценённого навыка (warmup/closing, пропуск без транскрипта)
    и навык, который не покрывает ни один вопрос комплекта, в максимум не входят:
    «не задали» ≠ «не подтверждён». Навык с оценками и уровнем 0 (задали и не
    ответил) входит в максимум полным весом.
    """
    per_skill: dict[str, list[int]] = {}
    scored_questions = 0
    question_points = 0.0
    for question_id in question_ids:
        scores = skill_scores_by_question.get(question_id, [])
        if scores:
            scored_questions += 1
            question_points += sum(score for _, score in scores) / len(scores)
        for skill, score in scores:
            per_skill.setdefault(skill.casefold(), []).append(score)

    skill_levels: list[dict[str, int | str]] = []
    skill_points = 0.0
    skill_max = 0.0
    for skill, weight in [*( (skill, 2.0) for skill in required_skills), *( (skill, 0.5) for skill in nice_to_have_skills)]:
        values = per_skill.get(skill.casefold(), [])
        if not values:
            # Вопросов, оценивающих навык, в комплекте нет: не задали ≠ не подтверждён —
            # навык не участвует ни в баллах, ни в максимуме, и в skill_levels не идёт
            # (на фронте такая строка карты требований остаётся «Вопрос не задан»).
            continue
        level = max(0, min(3, round(sum(values) / len(values))))
        skill_points += level / 3 * weight
        skill_max += weight
        skill_levels.append({"skill_tag": skill, "level": level})

    max_score = scored_questions * 3 + skill_max
    total = question_points + skill_points
    percent = round(total / max_score * 100) if max_score else 0
    if has_contradictions or percent == 60:
        verdict = Verdict.NEEDS_REVIEW
    elif percent > 60:
        verdict = Verdict.FITS
    else:
        verdict = Verdict.NOT_FITS
    return InterviewScore(question_points, skill_points, max_score, percent, skill_levels, verdict)
