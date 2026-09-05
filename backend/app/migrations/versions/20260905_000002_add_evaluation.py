"""add evaluation table

Revision ID: 20260905_000002
Revises: 20260905_000001
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260905_000002"
down_revision: str | None = "20260905_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evaluation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column(
            "per_question",
            postgresql.JSONB().with_variant(sa.JSON(), "sqlite"),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("verdict", sa.Text(), nullable=False),
        sa.Column(
            "confirmed_skills",
            sa.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "unconfirmed_skills",
            sa.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "contradictions_found",
            postgresql.JSONB().with_variant(sa.JSON(), "sqlite"),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "strengths",
            sa.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "risks",
            sa.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("summary_intro", sa.Text(), nullable=True),
        sa.Column("summary_conclusion", sa.Text(), nullable=True),
        sa.Column("model_version", sa.Text(), nullable=True),
        sa.Column("prompt_version", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id"),
    )
    op.create_index(op.f("ix_evaluation_interview_id"), "evaluation", ["interview_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_evaluation_interview_id"), table_name="evaluation")
    op.drop_table("evaluation")
