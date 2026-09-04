"""initial schema — recruiter/vacancy/question/interview (specs/003, minimal slice) + answer (specs/004, T004)

Написана вручную, не автосгенерирована — `alembic revision --autogenerate` требует живого
Postgres, недоступного в песочнице на момент написания (см. специфику окружения в
специкитовом tasks.md). Соответствует моделям в `app/models/` 1:1 — при первом запуске
`alembic upgrade head` на реальном Postgres сверить `alembic check`/`--autogenerate` diff
на пусто, прежде чем полагаться на этот файл как на источник истины дальше.

Revision ID: 0001
Revises:
Create Date: 2026-09-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recruiter",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "vacancy",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("recruiter_id", sa.Uuid(), sa.ForeignKey("recruiter.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("grade", sa.Text(), nullable=False),
        sa.Column("required_skills", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("nice_to_have_skills", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column(
            "status", sa.Enum("draft", "ready", name="vacancy_status"), nullable=False, server_default="draft"
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "interview",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("vacancy_id", sa.Uuid(), sa.ForeignKey("vacancy.id"), nullable=False),
        sa.Column("candidate_name", sa.Text(), nullable=True),
        sa.Column("resume_file_url", sa.Text(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "status",
            sa.Enum("created", "in_progress", "completed", "processing_failed", name="interview_status"),
            nullable=False,
            server_default="created",
        ),
        sa.Column("dynamic_questions_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "question",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("vacancy_id", sa.Uuid(), sa.ForeignKey("vacancy.id"), nullable=False),
        sa.Column("interview_id", sa.Uuid(), sa.ForeignKey("interview.id"), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("skill_tag", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("intent", sa.Text(), nullable=True),
        sa.Column("reference_answer", sa.Text(), nullable=True),
        sa.Column(
            "format",
            sa.Enum("voice", "code_review_verbal", "live_coding", name="question_format"),
            nullable=False,
            server_default="voice",
        ),
        sa.Column(
            "role",
            sa.Enum("assessment", "warmup", "closing", name="question_role"),
            nullable=False,
            server_default="assessment",
        ),
        sa.Column(
            "difficulty",
            sa.Enum("baseline", "stretch", name="question_difficulty"),
            nullable=False,
            server_default="baseline",
        ),
        sa.Column("estimated_duration_sec", sa.Integer(), nullable=False),
        sa.Column("stimulus", postgresql.JSONB(), nullable=True),
        sa.Column(
            "source",
            sa.Enum("base_generated", "base_edited", "base_manual", "dynamic", name="question_source"),
            nullable=False,
        ),
        sa.Column(
            "dynamic_trigger",
            sa.Enum(
                "clarification",
                "contradiction_check",
                "drill_down",
                "leading_hint",
                "resume_inspired",
                name="question_dynamic_trigger",
            ),
            nullable=True,
        ),
        sa.Column("parent_question_id", sa.Uuid(), sa.ForeignKey("question.id"), nullable=True),
    )

    op.create_table(
        "answer",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("interview_id", sa.Uuid(), sa.ForeignKey("interview.id"), nullable=False),
        sa.Column("question_id", sa.Uuid(), sa.ForeignKey("question.id"), nullable=False),
        sa.Column("role", sa.Enum("assessment", "warmup", "closing", name="answer_role"), nullable=False),
        sa.Column("video_url", sa.Text(), nullable=True),
        sa.Column("audio_url", sa.Text(), nullable=True),
        sa.Column("transcript_text", sa.Text(), nullable=True),
        sa.Column("code_submission", sa.Text(), nullable=True),
        sa.Column("code_language", sa.Text(), nullable=True),
        sa.Column("code_snapshots", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("answer")
    op.drop_table("question")
    op.drop_table("interview")
    op.drop_table("vacancy")
    op.drop_table("recruiter")
    for enum_name in (
        "vacancy_status",
        "interview_status",
        "question_format",
        "question_role",
        "question_difficulty",
        "question_source",
        "question_dynamic_trigger",
        "answer_role",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
