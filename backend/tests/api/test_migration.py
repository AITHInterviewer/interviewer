import asyncio
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.config import settings


async def _create_legacy_schema_and_seed(db_url: str) -> None:
    engine = create_async_engine(db_url)
    async with engine.begin() as connection:
        await connection.execute(
            text(
                """
                CREATE TABLE internal_users (
                    id CHAR(32) NOT NULL PRIMARY KEY,
                    email VARCHAR(320) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(8) NOT NULL,
                    created_by_user_id CHAR(32) NULL,
                    must_rotate_password BOOLEAN NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_login_at DATETIME NULL
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO internal_users (id, email, name, password_hash, role) "
                "VALUES (:id, 'legacy@example.com', 'Legacy Expert', 'hash', 'expert')"
            ),
            {"id": uuid.uuid4().hex},
        )
    await engine.dispose()


@pytest.mark.anyio
async def test_migration_backfills_single_role_accounts(tmp_path, monkeypatch) -> None:
    legacy_db_path = Path(tmp_path) / "legacy.db"
    db_url = f"sqlite+aiosqlite:///{legacy_db_path}"
    await _create_legacy_schema_and_seed(db_url)

    # env.py reads settings.database_url; point it at the legacy database.
    monkeypatch.setattr(settings, "database_url", db_url)
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("script_location", "app/migrations")
    # Alembic's async env runs its own event loop; execute in a fresh thread.
    await asyncio.to_thread(command.stamp, alembic_cfg, "20260903_000001")
    await asyncio.to_thread(command.upgrade, alembic_cfg, "20260904_000001")

    engine = create_async_engine(db_url)
    async with AsyncSession(engine) as session:
        columns = (
            await session.execute(text("PRAGMA table_info(internal_users)"))
        ).all()
        column_names = {row[1] for row in columns}
        assert "role" not in column_names

        assignments = (
            await session.execute(text("SELECT role_code FROM internal_role_assignments"))
        ).all()
        assert [row[0] for row in assignments] == ["expert"]
    await engine.dispose()
