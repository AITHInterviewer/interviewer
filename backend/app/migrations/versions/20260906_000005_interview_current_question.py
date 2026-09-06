"""interview current_question_id/current_question_text

Revision ID: 20260906_000005
Revises: 20260906_000003
Create Date: 2026-09-06

Персистентная база question_started для reconnect/перезагрузки страницы кандидата —
раньше текст текущего вопроса жил только в памяти вкладки (последний WS ControlEvent),
и доп./наводящий вопрос (adaptive_question/checkin) тем же полем стирал основной.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "20260906_000005"
down_revision: str | None = "20260906_000003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = ("current_question_id", "current_question_text")


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("interview")}
    with op.batch_alter_table("interview") as batch_op:
        if "current_question_id" not in columns:
            batch_op.add_column(
                sa.Column("current_question_id", sa.Uuid(), sa.ForeignKey("question.id"), nullable=True)
            )
        if "current_question_text" not in columns:
            batch_op.add_column(sa.Column("current_question_text", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("interview")}
    with op.batch_alter_table("interview") as batch_op:
        for name in _COLUMNS:
            if name in columns:
                batch_op.drop_column(name)
