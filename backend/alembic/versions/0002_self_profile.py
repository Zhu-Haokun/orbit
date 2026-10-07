"""self profile: people.is_self / mbti / interests

Revision ID: 0002_self_profile
Revises: 0001_initial
Create Date: 2026-10-06

Adds three columns to ``people`` so the user can keep a profile for themselves:

* ``is_self``    -- marks the single row that represents "me".
                    That row never shows up in /api/people; it is served by /api/me.
* ``mbti``       -- free text typed by the user (never inferred).
* ``interests``  -- comma separated hobbies, also user typed only.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_self_profile"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "people",
        sa.Column("is_self", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("people", sa.Column("mbti", sa.String(length=8), nullable=True))
    op.add_column("people", sa.Column("interests", sa.Text(), nullable=True))
    op.create_index("ix_people_is_self", "people", ["is_self"])


def downgrade() -> None:
    op.drop_index("ix_people_is_self", table_name="people")
    op.drop_column("people", "interests")
    op.drop_column("people", "mbti")
    op.drop_column("people", "is_self")
