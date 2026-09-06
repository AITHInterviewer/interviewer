"""vacancy requirements: извлечённые из описания требования

Revision ID: 20260907_000001
Revises: 20260906_000008
Create Date: 2026-09-07

`vacancy.requirements` (jsonb, not null, default '[]') — список требований, которые LLM
вычленила из описания вакансии (specs/010-vacancy-from-description). Не отдельная таблица:
на пилоте требование не переиспользуется между вакансиями, общего справочника нет.

`vacancy.description_source` ('text' | 'pdf') и `vacancy.description_file_name` — чтобы
в редакторе показать, из какого файла приехало описание.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision: str = "20260907_000001"
down_revision: str | None = "20260906_000008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_JSONB = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("vacancy")}
    with op.batch_alter_table("vacancy") as batch_op:
        if "requirements" not in columns:
            batch_op.add_column(
                sa.Column("requirements", _JSONB, nullable=False, server_default="[]")
            )
        if "description_source" not in columns:
            batch_op.add_column(
                sa.Column("description_source", sa.Text(), nullable=False, server_default="text")
            )
        if "description_file_name" not in columns:
            batch_op.add_column(sa.Column("description_file_name", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("vacancy")}
    with op.batch_alter_table("vacancy") as batch_op:
        for name in ("description_file_name", "description_source", "requirements"):
            if name in columns:
                batch_op.drop_column(name)
