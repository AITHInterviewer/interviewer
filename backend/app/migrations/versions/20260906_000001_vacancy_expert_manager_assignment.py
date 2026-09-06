"""vacancy expert/hiring-manager assignment

Revision ID: 20260906_000001
Revises: 20260905_000002
Create Date: 2026-09-06

Добавляет `vacancy.expert_id`/`vacancy.hiring_manager_id` (nullable FK на
`internal_users.id`) — по одному человеку на роль, назначение опционально
(вакансия может быть без эксперта/менеджера).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260906_000001"
down_revision: str | None = "20260905_000002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("vacancy", sa.Column("expert_id", sa.Uuid(), nullable=True))
    op.add_column("vacancy", sa.Column("hiring_manager_id", sa.Uuid(), nullable=True))
    with op.batch_alter_table("vacancy") as batch_op:
        batch_op.create_foreign_key(
            "vacancy_expert_id_fkey", "internal_users", ["expert_id"], ["id"]
        )
        batch_op.create_foreign_key(
            "vacancy_hiring_manager_id_fkey", "internal_users", ["hiring_manager_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("vacancy") as batch_op:
        batch_op.drop_constraint("vacancy_hiring_manager_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("vacancy_expert_id_fkey", type_="foreignkey")
    op.drop_column("vacancy", "hiring_manager_id")
    op.drop_column("vacancy", "expert_id")
