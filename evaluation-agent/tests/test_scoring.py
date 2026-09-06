from evaluation_agent.schema import Verdict
from evaluation_agent.scoring import calculate_interview_score


def test_score_uses_fixed_vacancy_maximum_and_skill_weights():
    result = calculate_interview_score(
        question_ids=["q1", "q2"],
        skill_scores_by_question={"q1": [("Python", 3)], "q2": [("Docker", 3)]},
        required_skills=["Python"],
        nice_to_have_skills=["Docker"],
        has_contradictions=False,
    )
    assert result.max_score == 8.5  # 2 questions * 3 + 1 required * 2 + 1 optional * .5
    assert result.score_percent == 100
    assert result.verdict == Verdict.FITS


def test_exactly_sixty_percent_needs_review():
    result = calculate_interview_score(
        question_ids=["q1"],
        skill_scores_by_question={"q1": [("Python", 2), ("Docker", 0), ("Redis", 2), ("Kubernetes", 3)]},
        required_skills=["Python"],
        nice_to_have_skills=["Docker", "Redis", "Kubernetes"],
        has_contradictions=False,
    )
    assert result.score_percent == 60
    assert result.verdict == Verdict.NEEDS_REVIEW


def test_untested_skill_is_excluded_from_maximum_and_levels():
    """Навык, который не покрывает ни один вопрос, — «не задали», а не «не подтверждён»:
    ни баллов, ни места в максимуме, в skill_levels не попадает."""
    result = calculate_interview_score(
        question_ids=["q1"],
        skill_scores_by_question={"q1": [("Python", 3)]},
        required_skills=["Python", "Kubernetes"],
        nice_to_have_skills=["Docker"],
        has_contradictions=False,
    )
    assert result.max_score == 5  # 1 вопрос * 3 + только Python 2.0; Kubernetes/Docker не покрыты
    assert result.skill_levels == [{"skill_tag": "Python", "level": 3}]
    assert result.score_percent == 100


def test_asked_but_failed_skill_counts_in_maximum():
    """Задали и не ответил (уровень 0): навык остаётся в максимуме полным весом."""
    result = calculate_interview_score(
        question_ids=["q1"],
        skill_scores_by_question={"q1": [("Python", 0)]},
        required_skills=["Python"],
        nice_to_have_skills=[],
        has_contradictions=False,
    )
    assert result.max_score == 5
    assert result.skill_levels == [{"skill_tag": "Python", "level": 0}]
    assert result.score_percent == 0
    assert result.verdict == Verdict.NOT_FITS
