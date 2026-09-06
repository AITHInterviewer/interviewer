"""evaluation contour: evaluation + evaluation_job tables, processing status, event dedup

Revision ID: 20260906_000006
Revises: 20260906_000005
Create Date: 2026-09-06

Сквош бывших трёх миграций ветки (add_evaluation / add_evaluation_job /
add_live_event_stream_id) в одну — ни одна из них не была задеплоена, поэтому историю
пересобрали свежей, без коллизий revision id с main-овской цепочкой. Содержимое то же:

1. `evaluation` — результат оценки интервью от evaluation-agent (POST /evaluation).
2. `evaluation_job` — transactional outbox: interview completed -> pending-задача,
   которую агент забирает через /evaluation-jobs/claim.
3. `interview_status` — добавить значение 'processing' (техническая ось, пока агент
   работает; продуктовая ось — interview.product_state, её миграции не трогают).
4. `interview_event.source_event_id` — дедупликация durable Redis Stream
   (live_event_consumer.py): повторная доставка entry не плодит строки.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260906_000006"
down_revision: str | None = "20260906_000005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_jsonb = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")
_array = sa.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite")

_OLD_INTERVIEW_STATUS = postgresql.ENUM(
    "created",
    "in_progress",
    "completed",
    "processing_failed",
    name="interview_status",
    create_type=False,
)
_NEW_INTERVIEW_STATUS = postgresql.ENUM(
    "created",
    "in_progress",
    "processing",
    "completed",
    "processing_failed",
    name="interview_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    # 1. evaluation — результат оценки от evaluation-agent.
    op.create_table(
        "evaluation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("per_question", _jsonb, nullable=False, server_default="[]"),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("verdict", sa.Text(), nullable=False),
        sa.Column("confirmed_skills", _array, nullable=False, server_default="{}"),
        sa.Column("unconfirmed_skills", _array, nullable=False, server_default="{}"),
        sa.Column("contradictions_found", _jsonb, nullable=False, server_default="[]"),
        sa.Column("strengths", _array, nullable=False, server_default="{}"),
        sa.Column("risks", _array, nullable=False, server_default="{}"),
        sa.Column("summary_intro", sa.Text(), nullable=True),
        sa.Column("summary_conclusion", sa.Text(), nullable=True),
        sa.Column("model_version", sa.Text(), nullable=True),
        sa.Column("prompt_version", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id"),
    )
    op.create_index(op.f("ix_evaluation_interview_id"), "evaluation", ["interview_id"])

    # 2. evaluation_job — outbox-задачи на оценку (claim/complete/fail).
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

    # 3. interview_status: добавить processing.
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

    # 4. Дедупликация durable live event stream.
    op.add_column("interview_event", sa.Column("source_event_id", sa.String(length=64), nullable=True))
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("interview_event") as batch_op:
            batch_op.create_unique_constraint("uq_interview_event_source_event_id", ["source_event_id"])
    else:
        op.create_unique_constraint(
            "uq_interview_event_source_event_id", "interview_event", ["source_event_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()

    # 4. source_event_id.
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("interview_event") as batch_op:
            batch_op.drop_constraint("uq_interview_event_source_event_id", type_="unique")
    else:
        op.drop_constraint("uq_interview_event_source_event_id", "interview_event", type_="unique")
    op.drop_column("interview_event", "source_event_id")

    # 3. interview_status: убрать processing.
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

    # 2. evaluation_job.
    op.drop_index(op.f("ix_evaluation_job_status"), table_name="evaluation_job")
    op.drop_index(op.f("ix_evaluation_job_interview_id"), table_name="evaluation_job")
    op.drop_table("evaluation_job")
    sa.Enum(name="evaluation_job_status").drop(bind, checkfirst=True)

    # 1. evaluation.
    op.drop_index(op.f("ix_evaluation_interview_id"), table_name="evaluation")
    op.drop_table("evaluation")
