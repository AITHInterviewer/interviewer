"""Тесты правила вердикта — раздел 5.1 архитектурного документа. Каждый тест называет
конкретный пункт правила, как заведено в live-agent/tests/test_state_machine.py."""

from evaluation_agent.schema import Difficulty, QuestionScore, Verdict
from evaluation_agent.verdict import aggregate_skills, compute_verdict


def test_all_required_pass_gives_fits():
    scores = [
        QuestionScore(skill_tag="Python", score=80),
        QuestionScore(skill_tag="PostgreSQL", score=65),
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python", "PostgreSQL"})
    assert compute_verdict(verdicts, has_contradictions=False) == Verdict.FITS


def test_one_required_fail_gives_not_fits():
    scores = [
        QuestionScore(skill_tag="Python", score=80),
        QuestionScore(skill_tag="PostgreSQL", score=20),  # < 40 -> fail
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python", "PostgreSQL"})
    assert compute_verdict(verdicts, has_contradictions=False) == Verdict.NOT_FITS


def test_ambiguous_required_gives_needs_review():
    scores = [
        QuestionScore(skill_tag="Python", score=80),
        QuestionScore(skill_tag="PostgreSQL", score=50),  # 40-59 -> ambiguous
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python", "PostgreSQL"})
    assert compute_verdict(verdicts, has_contradictions=False) == Verdict.NEEDS_REVIEW


def test_untested_required_skill_gives_needs_review():
    scores = [QuestionScore(skill_tag="Python", score=80)]
    # PostgreSQL обязателен, но по нему нет ни одного вопроса
    verdicts = aggregate_skills(scores, required_skills={"Python", "PostgreSQL"})
    assert compute_verdict(verdicts, has_contradictions=False) == Verdict.NEEDS_REVIEW


def test_contradiction_blocks_fits_even_with_all_skills_passing():
    scores = [QuestionScore(skill_tag="Python", score=90)]
    verdicts = aggregate_skills(scores, required_skills={"Python"})
    assert compute_verdict(verdicts, has_contradictions=True) == Verdict.NEEDS_REVIEW


def test_hint_caps_effective_score_at_60():
    # 90 с подсказкой -> эффективно 60 (граница pass, не 90)
    scores = [QuestionScore(skill_tag="Python", score=90, answered_with_hint=True)]
    verdicts = aggregate_skills(scores, required_skills={"Python"})
    assert verdicts[0].effective_score == 60


def test_required_skill_uses_minimum_across_baseline_questions():
    scores = [
        QuestionScore(skill_tag="Python", score=90),
        QuestionScore(skill_tag="Python", score=30),  # один слабый ответ топит навык
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python"})
    assert verdicts[0].effective_score == 30


def test_stretch_question_never_drags_required_skill_into_fail():
    scores = [
        QuestionScore(skill_tag="Python", score=70, difficulty=Difficulty.BASELINE),
        QuestionScore(skill_tag="Python", score=10, difficulty=Difficulty.STRETCH),  # провал stretch
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python"})
    # агрегат считается только по baseline (70), stretch-провал не понижает его
    assert verdicts[0].effective_score == 70
    assert verdicts[0].stretch_bonus is False


def test_stretch_success_sets_bonus_flag():
    scores = [
        QuestionScore(skill_tag="Python", score=70, difficulty=Difficulty.BASELINE),
        QuestionScore(skill_tag="Python", score=75, difficulty=Difficulty.STRETCH),
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python"})
    assert verdicts[0].stretch_bonus is True


def test_nice_to_have_skill_uses_average_not_minimum():
    scores = [
        QuestionScore(skill_tag="Docker", score=80),
        QuestionScore(skill_tag="Docker", score=40),
    ]
    verdicts = aggregate_skills(scores, required_skills=set())  # Docker — nice-to-have
    assert verdicts[0].effective_score == 60  # среднее (80+40)/2, не минимум


def test_weak_nice_to_have_does_not_block_fits():
    scores = [
        QuestionScore(skill_tag="Python", score=90),
        QuestionScore(skill_tag="Docker", score=10),  # слабый доп. навык
    ]
    verdicts = aggregate_skills(scores, required_skills={"Python"})
    assert compute_verdict(verdicts, has_contradictions=False) == Verdict.FITS
