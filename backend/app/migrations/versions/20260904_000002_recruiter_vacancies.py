"""recruiter vacancies

Revision ID: 20260904_000002
Revises: 20260904_000001
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260904_000002"
down_revision: str | None = "20260904_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vacancies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("grade", sa.String(length=32), nullable=True),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("ideal_candidate_profile", sa.Text(), nullable=True),
        sa.Column("required_skills", sa.JSON(), nullable=False),
        sa.Column("nice_to_have_skills", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("status_before_archive", sa.String(length=32), nullable=True),
        sa.Column("created_by_recruiter_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("managing_recruiter_id", sa.Uuid(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["archived_by_user_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["created_by_recruiter_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["managing_recruiter_id"], ["internal_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vacancies_status"), "vacancies", ["status"])
    op.create_index(op.f("ix_vacancies_created_by_recruiter_id"), "vacancies", ["created_by_recruiter_id"])
    op.create_index(op.f("ix_vacancies_created_by_user_id"), "vacancies", ["created_by_user_id"])
    op.create_index(op.f("ix_vacancies_managing_recruiter_id"), "vacancies", ["managing_recruiter_id"])

    op.create_table(
        "vacancy_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vacancy_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("skill_tags", sa.JSON(), nullable=True),
        sa.Column("intent", sa.Text(), nullable=True),
        sa.Column("reference_answer", sa.Text(), nullable=True),
        sa.Column("format", sa.String(length=64), nullable=False, server_default="voice"),
        sa.Column("role", sa.String(length=64), nullable=False, server_default="assessment"),
        sa.Column("difficulty", sa.String(length=64), nullable=False, server_default="baseline"),
        sa.Column("estimated_duration_sec", sa.Integer(), nullable=True),
        sa.Column("stimulus", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False, server_default="base_manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["vacancy_id"], ["vacancies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vacancy_questions_vacancy_id"), "vacancy_questions", ["vacancy_id"])

    op.create_table(
        "vacancy_review_decisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vacancy_id", sa.Uuid(), nullable=False),
        sa.Column("expert_user_id", sa.Uuid(), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["expert_user_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["vacancy_id"], ["vacancies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_vacancy_review_decisions_expert_user_id"), "vacancy_review_decisions", ["expert_user_id"]
    )
    op.create_index(
        op.f("ix_vacancy_review_decisions_vacancy_id"),
        "vacancy_review_decisions",
        ["vacancy_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_vacancy_review_decisions_vacancy_id"), table_name="vacancy_review_decisions")
    op.drop_index(op.f("ix_vacancy_review_decisions_expert_user_id"), table_name="vacancy_review_decisions")
    op.drop_table("vacancy_review_decisions")
    op.drop_index(op.f("ix_vacancy_questions_vacancy_id"), table_name="vacancy_questions")
    op.drop_table("vacancy_questions")
    op.drop_index(op.f("ix_vacancies_managing_recruiter_id"), table_name="vacancies")
    op.drop_index(op.f("ix_vacancies_created_by_user_id"), table_name="vacancies")
    op.drop_index(op.f("ix_vacancies_created_by_recruiter_id"), table_name="vacancies")
    op.drop_index(op.f("ix_vacancies_status"), table_name="vacancies")
    op.drop_table("vacancies")
