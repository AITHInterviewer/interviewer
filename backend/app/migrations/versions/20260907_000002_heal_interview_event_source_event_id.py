"""heal: interview_event.source_event_id отсутствует на застемпленной БД

Revision ID: 20260907_000002
Revises: 20260907_000001
Create Date: 2026-09-06

Боевая БД оказалась застемплена на голову цепочки (alembic_version=20260907_000001),
но DDL шага 4 миграции 20260906_000006 — `interview_event.source_event_id` + уникальный
constraint, и шага 3 — значение 'processing' у enum `interview_status` — на ней не
выполнился (следствие ручного `alembic stamp` при разборе squash-конфликта веток).

Из-за отсутствия колонки каждый `InterviewEventService.record_event()` падал с
`UndefinedColumnError`: относ live-agent → backend (`_relay_control_events`) умирал на
первом же событии, `interview_completed` не обрабатывался, интервью навсегда застревало
в `in_progress`, `evaluation_job` не создавался (2026-09-06).

До-накатываем недостающее идемпотентно. Тесты гоняют схему через `Base.metadata.create_all`
(см. `conftest.py`), миграции там не выполняются вовсе — эта ревизия работает только на
реальном Postgres при деплое; на БД, где 20260906_000006 отработала полностью, всё это no-op.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260907_000002"
down_revision: str | None = "20260907_000001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TABLE interview_event ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(64)")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_interview_event_source_event_id'
            ) THEN
                ALTER TABLE interview_event
                    ADD CONSTRAINT uq_interview_event_source_event_id UNIQUE (source_event_id);
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TYPE interview_status ADD VALUE IF NOT EXISTS 'processing'")


def downgrade() -> None:
    # Лечебная ревизия: колонку/constraint формально «создаёт» ещё 20260906_000006,
    # поэтому откат тут ничего не удаляет — иначе downgrade увёл бы БД в то же битое
    # состояние, ради выхода из которого написана эта миграция.
    pass
