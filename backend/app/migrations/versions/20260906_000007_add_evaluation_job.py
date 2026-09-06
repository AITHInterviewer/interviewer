"""add evaluation_job outbox table + processing status for interview

Revision ID: 20260906_000007
Revises: 20260906_000006
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260906_000007"
down_revision: str | None = "20260906_000006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_INTERVIEW_STATUS = postgresql.ENUM(
    "created", "in_progress", "completed", "processing_failed",
    name="interview_status",
    create_type=False,
)
_NEW_INTERVIEW_STATUS = postgresql.ENUM(
    "created", "in_progress", "processing", "completed", "processing_failed",
    name="interview_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    # 1. evaluation_job — transactional outbox для batch-оценки.
    op.create_table(
        "evaluation_job",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "processing", "completed", "failed", name="evaluation_job_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id"),
    )
    op.create_index(op.f("ix_evaluation_job_interview_id"), "evaluation_job", ["interview_id"])
    op.create_index(op.f("ix_evaluation_job_status"), "evaluation_job", ["status"])

    # 2. interview_status: добавить processing.
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE interview_status ADD VALUE IF NOT EXISTS 'processing'")
    else:
        with op.batch_alter_table("interview") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=_OLD_INTERVIEW_STATUS,
                type_=_NEW_INTERVIEW_STATUS,
                existing_server_default="created",
            )


def downgrade() -> None:
    bind = op.get_bind()

    # 1. evaluation_job.
    op.drop_index(op.f("ix_evaluation_job_status"), table_name="evaluation_job")
    op.drop_index(op.f("ix_evaluation_job_interview_id"), table_name="evaluation_job")
    op.drop_table("evaluation_job")
    sa.Enum(name="evaluation_job_status").drop(bind, checkfirst=True)

    # 2. interview_status: убрать processing.
    # На случай реальных processing-строк при откате — переводим в completed,
    # иначе cast на старый enum упадёт.
    interview = sa.table("interview", sa.column("status", sa.Text()))
    bind.execute(interview.update().where(interview.c.status == "processing").values(status="completed"))

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE interview_status RENAME TO interview_status_old")
        _OLD_INTERVIEW_STATUS.create(bind, checkfirst=True)
        op.execute(
            "ALTER TABLE interview ALTER COLUMN status TYPE interview_status "
            "USING status::text::interview_status"
        )
        op.execute("DROP TYPE interview_status_old")
    else:
        with op.batch_alter_table("interview") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=_NEW_INTERVIEW_STATUS,
                type_=_OLD_INTERVIEW_STATUS,
                existing_server_default="created",
            )
