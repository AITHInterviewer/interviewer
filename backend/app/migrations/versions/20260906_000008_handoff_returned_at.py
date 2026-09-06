"""track return from hiring manager

Revision ID: 20260906_000008
Revises: 20260906_000007
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "20260906_000008"
down_revision: str | None = "20260906_000007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("handoff")}
    if "returned_at" not in columns:
        with op.batch_alter_table("handoff") as batch_op:
            batch_op.add_column(sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("handoff")}
    if "returned_at" in columns:
        with op.batch_alter_table("handoff") as batch_op:
            batch_op.drop_column("returned_at")
