"""clarification_request.created_at

Revision ID: 20260906_000006
Revises: 20260906_000005
Create Date: 2026-09-06

Миграция 20260905_000002 создала clarification_request без created_at, хотя
модель ClarificationRequest её объявляет — любой SELECT по модели падал в
боевой Postgres-базе (ручки /interviews/{id}/clarifications, /audit, /extra).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "20260906_000006"
down_revision: str | None = "20260906_000005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("clarification_request")}
    if "created_at" not in columns:
        op.add_column(
            "clarification_request",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("clarification_request")}
    if "created_at" in columns:
        op.drop_column("clarification_request", "created_at")
