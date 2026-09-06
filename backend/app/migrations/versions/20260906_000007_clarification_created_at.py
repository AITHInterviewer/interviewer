"""clarification_request.created_at

Revision ID: 20260906_000007
Revises: 20260906_000006
Create Date: 2026-09-06

Дрейф модели и миграций: ORM `app/models/clarification.py` объявляет created_at
(server_default=now), но 20260905_000002 создаёт таблицу clarification_request без
этой колонки (у handoff/manager_opinion_grant в той же миграции она есть — забыли).
Любой ORM-select по ClarificationRequest падал с UndefinedColumnError -> 500 на
GET /interviews/{id}/clarifications, и страница кандидата оставалась без карты
требований (loadVacancy в Promise.all не доходил до setVacancy).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "20260906_000007"
down_revision: str | None = "20260906_000006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("clarification_request")}
    with op.batch_alter_table("clarification_request") as batch_op:
        if "created_at" not in columns:
            batch_op.add_column(
                sa.Column(
                    "created_at",
                    sa.DateTime(timezone=True),
                    server_default=sa.func.now(),
                    nullable=False,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("clarification_request")}
    with op.batch_alter_table("clarification_request") as batch_op:
        if "created_at" in columns:
            batch_op.drop_column("created_at")
