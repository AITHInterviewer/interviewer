"""vacancy recruiter fk retarget + pending_review status + interview_event

Revision ID: 20260905_000001
Revises: 20260904_000001
Create Date: 2026-09-05

Переносит `vacancy.recruiter_id` на `internal_users.id` (реальная identity/auth-модель) —
`Recruiter` был временной заглушкой (см. `app/models/recruiter.py`), больше не FK-цель.

ИСПРАВЛЕНО 2026-09-05: изначально считалось, что бэкфилл не нужен ("реальных строк
`vacancy` не существует") — оказалось неверно на реальном деплое (self-hosted раннер),
там уже были демо-данные из `scripts/seed_demo_interview.py`/`seed-demo-interview.yml`
со старыми `recruiter_id`, и `ALTER TABLE ... ADD CONSTRAINT` падал с
`ForeignKeyViolationError`. Теперь `_backfill_recruiter_to_internal_user` заводит (или
переиспользует по email) `InternalUser` на каждого `Recruiter`, на которого реально
ссылается `vacancy.recruiter_id`, и перекладывает ссылки — до навешивания FK.

Также добавляет `pending_review` в `vacancy_status` (`draft → pending_review → ready`) и
создаёт `interview_event` — сырой лог событий интервью (MVP-запись, см. план
`interview_event_service.py`).
"""

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

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


def _backfill_recruiter_to_internal_user(bind: sa.engine.Connection) -> None:
    """Для каждого `recruiter.id`, на который ссылается существующий `vacancy.recruiter_id`,
    находит по email (или создаёт) соответствующий `internal_users` и перекладывает
    ссылку — иначе `ADD CONSTRAINT vacancy_recruiter_id_fkey` падает на реальных данных."""
    recruiter = sa.table(
        "recruiter",
        sa.column("id", sa.Uuid()),
        sa.column("email", sa.Text()),
        sa.column("name", sa.Text()),
    )
    internal_users = sa.table(
        "internal_users",
        sa.column("id", sa.Uuid()),
        sa.column("email", sa.String()),
        sa.column("name", sa.String()),
        sa.column("password_hash", sa.String()),
        sa.column("must_rotate_password", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    vacancy = sa.table(
        "vacancy",
        sa.column("id", sa.Uuid()),
        sa.column("recruiter_id", sa.Uuid()),
    )

    used_recruiter_ids = {
        row.recruiter_id for row in bind.execute(sa.select(vacancy.c.recruiter_id).distinct())
    }
    if not used_recruiter_ids:
        return

    recruiters = bind.execute(
        sa.select(recruiter.c.id, recruiter.c.email, recruiter.c.name).where(
            recruiter.c.id.in_(used_recruiter_ids)
        )
    ).all()

    for old_id, email, name in recruiters:
        new_id = bind.execute(
            sa.select(internal_users.c.id).where(internal_users.c.email == email)
        ).scalar_one_or_none()
        if new_id is None:
            new_id = uuid.uuid4()
            bind.execute(
                internal_users.insert().values(
                    id=new_id,
                    email=email,
                    name=name,
                    # Сентинел, а не настоящий хэш — у мигрированных из Recruiter
                    # пользователей никогда не было пароля; must_rotate_password=True
                    # не даёт залогиниться этим сентинелом молча.
                    password_hash="!migrated-recruiter-no-login",
                    must_rotate_password=True,
                    created_at=datetime.now(timezone.utc),
                )
            )
        bind.execute(
            vacancy.update().where(vacancy.c.recruiter_id == old_id).values(recruiter_id=new_id)
        )


def upgrade() -> None:
    bind = op.get_bind()

    # 1. `vacancy.recruiter_id` FK: recruiter.id → internal_users.id.
    #
    # Drop the OLD constraint before backfilling: the backfill's `UPDATE vacancy SET
    # recruiter_id=<new internal_users id>` is itself an FK-checked write, and while the
    # old `recruiter_id → recruiter.id` constraint is still in place, that new id (which
    # by definition isn't a `recruiter.id`) is rejected by ITS OWN OLD CONSTRAINT before
    # the new one even exists — found via a real ForeignKeyViolationError on the first
    # backfill attempt (deploy run 33959285286: "Key (recruiter_id)=(...) is not present
    # in table recruiter"). Order must be: drop old FK -> backfill -> add new FK.
    if bind.dialect.name == "postgresql":
        op.drop_constraint("vacancy_recruiter_id_fkey", "vacancy", type_="foreignkey")
    else:
        # SQLite не поддерживает ALTER TABLE ... DROP CONSTRAINT — batch-режим
        # пересобирает таблицу целиком (см. 20260904_000001 для того же паттерна).
        with op.batch_alter_table("vacancy") as batch_op:
            batch_op.drop_constraint("vacancy_recruiter_id_fkey", type_="foreignkey")

    _backfill_recruiter_to_internal_user(bind)

    if bind.dialect.name == "postgresql":
        op.create_foreign_key(
            "vacancy_recruiter_id_fkey",
            "vacancy",
            "internal_users",
            ["recruiter_id"],
            ["id"],
        )
    else:
        with op.batch_alter_table("vacancy") as batch_op:
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
