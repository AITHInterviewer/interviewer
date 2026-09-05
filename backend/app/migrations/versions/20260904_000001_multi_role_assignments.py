"""multi-role assignments

Revision ID: 20260904_000001
Revises: 20260903_000001
Create Date: 2026-09-04

Creates the normalized internal_role_assignments table, backfills one
assignment per existing account from the legacy internal_users.role column,
then drops that column.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260904_000001"
down_revision: str | None = "20260903_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY_ROLE_VALUES = ("recruiter", "hiring_manager", "expert")


def upgrade() -> None:
    op.create_table(
        "internal_role_assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_code", sa.String(length=64), nullable=False),
        sa.Column("assigned_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["internal_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "role_code", name="uq_role_assignment_user_role"),
    )
    op.create_index(
        op.f("ix_internal_role_assignments_user_id"), "internal_role_assignments", ["user_id"]
    )
    op.create_index(
        op.f("ix_internal_role_assignments_role_code"), "internal_role_assignments", ["role_code"]
    )

    # Backfill: one assignment per existing account from the legacy role column.
    # Untyped core columns let PostgreSQL infer the enum type for the comparison
    # (a literal "WHERE role = :varchar" would fail with "operator does not
    # exist: internal_user_role = character varying"), and stay portable.
    bind = op.get_bind()
    internal_users = sa.table("internal_users", sa.column("id"), sa.column("role"))
    internal_role_assignments = sa.table(
        "internal_role_assignments", sa.column("user_id"), sa.column("role_code")
    )

    def role_matches(role_value: str):
        # PostgreSQL stores the legacy column as the internal_user_role enum;
        # comparing it to a plain string param fails ("operator does not exist"),
        # so cast explicitly. SQLite stores it as plain text — no cast needed.
        if bind.dialect.name == "postgresql":
            legacy_enum = sa.Enum(*LEGACY_ROLE_VALUES, name="internal_user_role", create_type=False)
            return internal_users.c.role == sa.cast(role_value, legacy_enum)
        return internal_users.c.role == role_value

    for role_value in LEGACY_ROLE_VALUES:
        rows = bind.execute(
            sa.select(internal_users.c.id).where(role_matches(role_value))
        ).fetchall()
        if rows:
            bind.execute(
                internal_role_assignments.insert(),
                [{"user_id": row[0], "role_code": role_value} for row in rows],
            )

    # batch mode keeps this working on SQLite (which cannot DROP COLUMN
    # natively before 3.35) and remains correct on PostgreSQL.
    with op.batch_alter_table("internal_users") as batch_op:
        batch_op.drop_column("role")


def downgrade() -> None:
    user_role_enum = sa.Enum(*LEGACY_ROLE_VALUES, name="internal_user_role")
    user_role_enum.create(op.get_bind(), checkfirst=True)

    with op.batch_alter_table("internal_users") as batch_op:
        batch_op.add_column(sa.Column("role", user_role_enum, nullable=True))

    bind = op.get_bind()
    internal_users = sa.table("internal_users", sa.column("id"), sa.column("role"))
    internal_role_assignments = sa.table(
        "internal_role_assignments", sa.column("user_id"), sa.column("role_code")
    )
    for role_value in LEGACY_ROLE_VALUES:
        bind.execute(
            internal_users.update()
            .where(
                internal_users.c.id.in_(
                    sa.select(internal_role_assignments.c.user_id).where(
                        internal_role_assignments.c.role_code == role_value
                    )
                )
            )
            .values(role=role_value)
        )

    op.drop_index(op.f("ix_internal_role_assignments_role_code"), table_name="internal_role_assignments")
    op.drop_index(op.f("ix_internal_role_assignments_user_id"), table_name="internal_role_assignments")
    op.drop_table("internal_role_assignments")
