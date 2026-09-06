"""interview recording: recording_egress_id, recording_url

Revision ID: 20260906_000003
Revises: 20260906_000002
Create Date: 2026-09-06

LiveKit Egress (см. app/services/livekit_egress.py): `recording_egress_id` — нужен, чтобы
остановить запись на interview_completed; `recording_url` — публичная ссылка на файл в
S3/MinIO (recordings_s3_bucket) для проигрывания на странице кандидата.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "20260906_000003"
down_revision: str | None = "20260906_000002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = ("recording_egress_id", "recording_url")


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("interview")}
    with op.batch_alter_table("interview") as batch_op:
        for name in _COLUMNS:
            if name not in columns:
                batch_op.add_column(sa.Column(name, sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("interview")}
    with op.batch_alter_table("interview") as batch_op:
        for name in _COLUMNS:
            if name in columns:
                batch_op.drop_column(name)
