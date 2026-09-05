"""pilot product model: vacancy statuses, rubric versions, interview axes

Revision ID: 20260905_000002
Revises: 20260905_000001
Create Date: 2026-09-05

Vacancy.status: pending_review → calibration, ready → active; новые значения
extracted / changes_requested / approved / paused / archived.

Interview: product_state, consented_at, rubric_version_id, report_status,
report_json, recruiter_decision.

Новые таблицы: rubric_version, clarification_request, handoff, manager_opinion_grant.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260905_000002"
down_revision: str | None = "20260905_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_STATUSES = (
    "draft",
    "extracted",
    "calibration",
    "changes_requested",
    "approved",
    "active",
    "paused",
    "archived",
)

_STATUS_UPGRADE = """
CASE status::text
    WHEN 'pending_review' THEN 'calibration'
    WHEN 'ready' THEN 'active'
    ELSE status::text
END
"""

_STATUS_DOWNGRADE = """
CASE status::text
    WHEN 'extracted' THEN 'draft'
    WHEN 'calibration' THEN 'pending_review'
    WHEN 'changes_requested' THEN 'pending_review'
    WHEN 'approved' THEN 'ready'
    WHEN 'active' THEN 'ready'
    WHEN 'paused' THEN 'ready'
    WHEN 'archived' THEN 'ready'
    ELSE status::text
END
"""


def _json_type() -> sa.types.TypeEngine:
    return postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def _upgrade_postgres_vacancy_status() -> None:
    op.execute("ALTER TABLE vacancy ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "CREATE TYPE vacancy_status_new AS ENUM "
        "('draft', 'extracted', 'calibration', 'changes_requested', "
        "'approved', 'active', 'paused', 'archived')"
    )
    op.execute(
        "ALTER TABLE vacancy ALTER COLUMN status TYPE vacancy_status_new "
        f"USING ({_STATUS_UPGRADE})::vacancy_status_new"
    )
    op.execute("DROP TYPE vacancy_status")
    op.execute("ALTER TYPE vacancy_status_new RENAME TO vacancy_status")
    op.execute("ALTER TABLE vacancy ALTER COLUMN status SET DEFAULT 'draft'")


def _upgrade_sqlite_vacancy_status() -> None:
    # CHECK старого enum не пропускает calibration/active — копируем через Text.
    with op.batch_alter_table("vacancy") as batch_op:
        batch_op.add_column(sa.Column("status_tmp", sa.Text(), nullable=True))
    op.execute(
        """
        UPDATE vacancy SET status_tmp = CASE status
            WHEN 'pending_review' THEN 'calibration'
            WHEN 'ready' THEN 'active'
            ELSE status
        END
        """
    )
    with op.batch_alter_table("vacancy") as batch_op:
        batch_op.drop_column("status")
        batch_op.alter_column(
            "status_tmp",
            new_column_name="status",
            existing_type=sa.Text(),
            nullable=False,
            server_default="draft",
        )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _upgrade_postgres_vacancy_status()
    else:
        _upgrade_sqlite_vacancy_status()

    op.create_table(
        "rubric_version",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vacancy_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("approved_by_id", sa.Uuid(), nullable=True),
        sa.Column("snapshot", _json_type(), nullable=False),
        sa.ForeignKeyConstraint(["vacancy_id"], ["vacancy.id"]),
        sa.ForeignKeyConstraint(["approved_by_id"], ["internal_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column(
        "interview",
        sa.Column("product_state", sa.Text(), server_default="invited", nullable=False),
    )
    op.add_column("interview", sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("interview", sa.Column("rubric_version_id", sa.Uuid(), nullable=True))
    op.add_column(
        "interview",
        sa.Column("report_status", sa.Text(), server_default="processing", nullable=False),
    )
    op.add_column("interview", sa.Column("report_json", _json_type(), nullable=True))
    op.add_column(
        "interview",
        sa.Column("recruiter_decision", sa.Text(), server_default="awaiting", nullable=False),
    )
    op.create_foreign_key(
        "interview_rubric_version_id_fkey",
        "interview",
        "rubric_version",
        ["rubric_version_id"],
        ["id"],
    )

    op.create_table(
        "clarification_request",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("close_reason", sa.Text(), nullable=True),
        sa.Column("extra_token", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"]),
        sa.ForeignKeyConstraint(["created_by_id"], ["internal_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("extra_token"),
    )

    op.create_table(
        "handoff",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("from_recruiter_id", sa.Uuid(), nullable=False),
        sa.Column("to_manager_id", sa.Uuid(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"]),
        sa.ForeignKeyConstraint(["from_recruiter_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["to_manager_id"], ["internal_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id"),
    )

    op.create_table(
        "manager_opinion_grant",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("manager_id", sa.Uuid(), nullable=False),
        sa.Column("granted_by_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"]),
        sa.ForeignKeyConstraint(["manager_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["granted_by_id"], ["internal_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def _downgrade_postgres_vacancy_status() -> None:
    op.execute("ALTER TABLE vacancy ALTER COLUMN status DROP DEFAULT")
    op.execute("CREATE TYPE vacancy_status_old AS ENUM ('draft', 'pending_review', 'ready')")
    op.execute(
        "ALTER TABLE vacancy ALTER COLUMN status TYPE vacancy_status_old "
        f"USING ({_STATUS_DOWNGRADE})::vacancy_status_old"
    )
    op.execute("DROP TYPE vacancy_status")
    op.execute("ALTER TYPE vacancy_status_old RENAME TO vacancy_status")
    op.execute("ALTER TABLE vacancy ALTER COLUMN status SET DEFAULT 'draft'")


def downgrade() -> None:
    op.drop_table("manager_opinion_grant")
    op.drop_table("handoff")
    op.drop_table("clarification_request")
    op.drop_constraint("interview_rubric_version_id_fkey", "interview", type_="foreignkey")
    op.drop_column("interview", "recruiter_decision")
    op.drop_column("interview", "report_json")
    op.drop_column("interview", "report_status")
    op.drop_column("interview", "rubric_version_id")
    op.drop_column("interview", "consented_at")
    op.drop_column("interview", "product_state")
    op.drop_table("rubric_version")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _downgrade_postgres_vacancy_status()
    else:
        with op.batch_alter_table("vacancy") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=sa.Text(),
                type_=sa.Enum("draft", "pending_review", "ready", name="vacancy_status"),
                existing_server_default="draft",
                nullable=False,
            )
