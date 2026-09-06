"""question stt_terms: ASR vocabulary hint per question

Revision ID: 20260906_000004
Revises: 20260906_000003
Create Date: 2026-09-06

`question.stt_terms` (text[], nullable) — термины, вероятные в устном ответе кандидата на
вопрос; заполняется LLM при approve вакансии и отдаётся live-agent через /live-input как
подсказка Whisper. Nullable, без server_default — «ещё не сгенерировано» отличается от
«сгенерировано пустым».
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision: str = "20260906_000004"
down_revision: str | None = "20260906_000003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ARRAY = postgresql.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("question")}
    if "stt_terms" not in columns:
        with op.batch_alter_table("question") as batch_op:
            batch_op.add_column(sa.Column("stt_terms", _ARRAY, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("question")}
    if "stt_terms" in columns:
        with op.batch_alter_table("question") as batch_op:
            batch_op.drop_column("stt_terms")
