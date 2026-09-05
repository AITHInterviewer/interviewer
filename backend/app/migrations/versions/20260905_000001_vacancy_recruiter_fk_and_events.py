"""vacancy recruiter fk retarget + pending_review status + interview_event

Revision ID: 20260905_000001
Revises: 20260904_000001
Create Date: 2026-09-05

Переносит `vacancy.recruiter_id` на `internal_users.id` (реальная identity/auth-модель) —
`Recruiter` был временной заглушкой (см. `app/models/recruiter.py`), больше не FK-цель.
Бэкфилла нет: реальных строк `vacancy` не существует, только демо-сид-скрипт
(`scripts/seed_demo_interview.py`), который сам обновлён под `InternalUser`.

Также добавляет `pending_review` в `vacancy_status` (`draft → pending_review → ready`) и
создаёт `interview_event` — сырой лог событий интервью (MVP-запись, см. план
`interview_event_service.py`).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260905_000001"
down_revision: str | None = "20260904_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_VACANCY_STATUS = postgresql.ENUM("draft", "ready", name="vacancy_status", create_type=False)
_NEW_VACANCY_STATUS = postgresql.ENUM(
    "draft", "pending_review", "ready", name="vacancy_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()

    # 1. `vacancy.recruiter_id` FK: recruiter.id → internal_users.id.
    if bind.dialect.name == "postgresql":
        op.drop_constraint("vacancy_recruiter_id_fkey", "vacancy", type_="foreignkey")
        op.create_foreign_key(
            "vacancy_recruiter_id_fkey",
            "vacancy",
            "internal_users",
            ["recruiter_id"],
            ["id"],
        )
    else:
        # SQLite не поддерживает ALTER TABLE ... DROP CONSTRAINT — batch-режим
        # пересобирает таблицу целиком (см. 20260904_000001 для того же паттерна).
        with op.batch_alter_table("vacancy") as batch_op:
            batch_op.drop_constraint("vacancy_recruiter_id_fkey", type_="foreignkey")
            batch_op.create_foreign_key(
                "vacancy_recruiter_id_fkey",
                "internal_users",
                ["recruiter_id"],
                ["id"],
            )

    # 2. `vacancy_status`: добавить `pending_review`.
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE vacancy_status ADD VALUE IF NOT EXISTS 'pending_review'")
    else:
        with op.batch_alter_table("vacancy") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=_OLD_VACANCY_STATUS,
                type_=_NEW_VACANCY_STATUS,
                existing_server_default="draft",
            )

    # 3. `interview_event`.
    op.create_table(
        "interview_event",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB().with_variant(sa.JSON(), "sqlite"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["interview_id"], ["interview.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_interview_event_interview_id"), "interview_event", ["interview_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_interview_event_interview_id"), table_name="interview_event")
    op.drop_table("interview_event")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # PostgreSQL can't drop an enum value directly — recreate the type without it.
        # No real `pending_review` rows are expected at this point (downgrade path only
        # used in dev), so a direct swap is safe.
        op.execute("ALTER TYPE vacancy_status RENAME TO vacancy_status_old")
        _OLD_VACANCY_STATUS.create(bind, checkfirst=True)
        op.execute(
            "ALTER TABLE vacancy ALTER COLUMN status TYPE vacancy_status "
            "USING status::text::vacancy_status"
        )
        op.execute("DROP TYPE vacancy_status_old")
    else:
        with op.batch_alter_table("vacancy") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=_NEW_VACANCY_STATUS,
                type_=_OLD_VACANCY_STATUS,
                existing_server_default="draft",
            )

    if bind.dialect.name == "postgresql":
        op.drop_constraint("vacancy_recruiter_id_fkey", "vacancy", type_="foreignkey")
        op.create_foreign_key(
            "vacancy_recruiter_id_fkey",
            "vacancy",
            "recruiter",
            ["recruiter_id"],
            ["id"],
        )
    else:
        with op.batch_alter_table("vacancy") as batch_op:
            batch_op.drop_constraint("vacancy_recruiter_id_fkey", type_="foreignkey")
            batch_op.create_foreign_key(
                "vacancy_recruiter_id_fkey",
                "recruiter",
                ["recruiter_id"],
                ["id"],
            )
