"""drop unused Interview.report_status column

Revision ID: 20260906_000002
Revises: 20260906_000001
Create Date: 2026-09-06

`report_status` дублировал product_state.report_processing/report_ready — никто в
коде его не писал, колонка навсегда застревала на дефолте "processing" и ложно
показывала «отчёт собирается» даже для не начатых интервью. Готовность отчёта
теперь читаем только из product_state.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "20260906_000002"
down_revision: str | None = "20260906_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("interview")}
    if "report_status" in columns:
        with op.batch_alter_table("interview") as batch_op:
            batch_op.drop_column("report_status")


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("interview")}
    if "report_status" not in columns:
        with op.batch_alter_table("interview") as batch_op:
            batch_op.add_column(
                sa.Column("report_status", sa.Text(), server_default="processing", nullable=False)
            )
