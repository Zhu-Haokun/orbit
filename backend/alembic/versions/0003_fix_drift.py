"""fix schema drift: commitments.updated_at + unique users.email

Revision ID: 0003_fix_drift
Revises: 0002_self_profile
Create Date: 2026-10-06

0001_initial was written by hand and drifted from the SQLAlchemy models.
Nobody noticed because Demo data has always been created by
``app.seed`` -> ``init_db()`` -> ``Base.metadata.create_all``, which builds the
schema from the models. Running ``alembic upgrade head`` on a fresh database
produced a schema the app could not use:

* ``commitments`` was missing ``updated_at`` (TimestampMixin), so every insert
  failed with "table commitments has no column named updated_at".
* ``users.email`` was indexed but not unique.

This revision closes the gap so the two paths agree.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_fix_drift"
down_revision: str | None = "0002_self_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 用 batch_alter 让 SQLite 也能加非空列。
    with op.batch_alter_table("commitments") as batch:
        batch.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            )
        )

    op.drop_index("ix_users_email", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    with op.batch_alter_table("commitments") as batch:
        batch.drop_column("updated_at")
