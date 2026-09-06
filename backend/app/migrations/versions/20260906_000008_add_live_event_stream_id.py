"""deduplicate durable live event stream entries

Revision ID: 20260906_000008
Revises: 20260906_000007
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260906_000008"
down_revision: str | None = "20260906_000007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("interview_event", sa.Column("source_event_id", sa.String(length=64), nullable=True))
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("interview_event") as batch_op:
            batch_op.create_unique_constraint("uq_interview_event_source_event_id", ["source_event_id"])
    else:
        op.create_unique_constraint(
            "uq_interview_event_source_event_id", "interview_event", ["source_event_id"]
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("interview_event") as batch_op:
            batch_op.drop_constraint("uq_interview_event_source_event_id", type_="unique")
    else:
        op.drop_constraint("uq_interview_event_source_event_id", "interview_event", type_="unique")
    op.drop_column("interview_event", "source_event_id")
