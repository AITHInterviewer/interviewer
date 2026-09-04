"""create internal users

Revision ID: 20260903_000001
Revises:
Create Date: 2026-09-03 00:00:01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260903_000001"
down_revision = None
branch_labels = None
depends_on = None


internal_user_role = postgresql.ENUM(
    "recruiter",
    "hiring_manager",
    "expert",
    name="internal_user_role",
    create_type=False,
)


def upgrade() -> None:
    internal_user_role.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "internal_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", internal_user_role, nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("must_rotate_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["internal_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_internal_users_email"), "internal_users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_internal_users_email"), table_name="internal_users")
    op.drop_table("internal_users")
    internal_user_role.drop(op.get_bind(), checkfirst=True)
