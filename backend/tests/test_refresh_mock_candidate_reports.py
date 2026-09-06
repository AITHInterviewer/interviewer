# ruff: noqa: E501
from scripts.refresh_mock_candidate_reports import build_report, calculate_interview_score


def test_canon_sixty_percent_needs_review():
    result = calculate_interview_score(
        question_ids=["q1"],
        skill_scores_by_question={"q1": [("Python", 2), ("Docker", 0), ("Redis", 2), ("Kubernetes", 3)]},
        required_skills=["Python"],
        nice_to_have_skills=["Docker", "Redis", "Kubernetes"],
        has_contradictions=False,
    )
    assert result.score_percent == 60
    assert result.verdict == "needs_review"


def test_build_report_has_skill_scores_not_legacy_keys():
    questions = [
        {"id": "w1", "order": 0, "role": "warmup", "skill_tag": [], "text": "Расскажите коротко, чем занимались в последнем проекте и какая у вас была зона ответственности."},
        {
            "id": "a1",
            "order": 1,
            "role": "assessment",
            "skill_tag": ["Python", "PostgreSQL", "Kafka"],
            "text": "Как спроектируете FastAPI-сервис, который пишет в Postgres и читает события из Kafka без потери сообщений?",
        },
        {
            "id": "a2",
            "order": 2,
            "role": "assessment",
            "skill_tag": ["PostgreSQL", "SQL"],
            "text": "Как будете искать медленный SQL-запрос в проде и что проверите в первую очередь?",
        },
    ]
    import random

    payload, transcripts = build_report(
        candidate_name="Лидия Орлова",
        questions=questions,
        required_skills=["Python", "PostgreSQL", "Kafka"],
        nice_to_have_skills=["Docker", "Redis"],
        rng=random.Random("test-seed"),
    )
    assert set(transcripts) == {"w1", "a1", "a2"}
    assert all(transcripts[key] for key in transcripts)
    assert "skill_verdicts" not in payload
    assert payload["verdict"] in {"fits", "not_fits", "needs_review"}
    assert 0 <= payload["score_percent"] <= 100
    for row in payload["per_question"]:
        assert row["skill_scores"]
        for entry in row["skill_scores"]:
            assert entry["score"] in {0, 1, 2, 3}
            assert entry["rationale"]
    assert "confirmed_skills" in payload
    assert isinstance(payload["strengths"], list)
