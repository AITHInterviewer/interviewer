"""interview links

Revision ID: 20260905_000001
Revises: 20260904_000002
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260905_000001"
down_revision: str | None = "20260904_000002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "vacancies",
        sa.Column("interview_time_limit_minutes", sa.Integer(), nullable=True),
    )

    op.create_table(
        "interview_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vacancy_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("candidate_first_name", sa.String(length=120), nullable=False),
        sa.Column("candidate_last_name", sa.String(length=120), nullable=False),
        sa.Column("candidate_social", sa.String(length=300), nullable=False),
        sa.Column("candidate_email", sa.String(length=320), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["vacancy_id"], ["vacancies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(op.f("ix_interview_links_vacancy_id"), "interview_links", ["vacancy_id"])
    op.create_index(op.f("ix_interview_links_token"), "interview_links", ["token"])
    op.create_index(op.f("ix_interview_links_expires_at"), "interview_links", ["expires_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_interview_links_expires_at"), table_name="interview_links")
    op.drop_index(op.f("ix_interview_links_token"), table_name="interview_links")
    op.drop_index(op.f("ix_interview_links_vacancy_id"), table_name="interview_links")
    op.drop_table("interview_links")
    op.drop_column("vacancies", "interview_time_limit_minutes")
