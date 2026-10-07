"""memory comments + interaction mood

Revision ID: 0004_memory_comments
Revises: 0003_fix_drift
Create Date: 2026-10-06

Two additions for the "come back and react later" loop:

* ``memory_comments`` -- a short note you leave when an old memory moves you.
  Kept separate from the interaction itself: the interaction is "what happened",
  the comment is "what I want to say about it now".
* ``interactions.mood`` -- one optional emoji picked while recording.
  Stored verbatim; never parsed, never aggregated.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_memory_comments"
down_revision: str | None = "0003_fix_drift"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_LENGTH = 36


def upgrade() -> None:
    op.add_column("interactions", sa.Column("mood", sa.String(length=16), nullable=True))

    op.create_table(
        "memory_comments",
        sa.Column("id", sa.CHAR(UUID_LENGTH), nullable=False),
        sa.Column("user_id", sa.CHAR(UUID_LENGTH), nullable=False),
        sa.Column("interaction_id", sa.CHAR(UUID_LENGTH), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["interaction_id"], ["interactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_comments_user_id", "memory_comments", ["user_id"])
    op.create_index("ix_memory_comments_interaction_id", "memory_comments", ["interaction_id"])


def downgrade() -> None:
    op.drop_index("ix_memory_comments_interaction_id", table_name="memory_comments")
    op.drop_index("ix_memory_comments_user_id", table_name="memory_comments")
    op.drop_table("memory_comments")
    op.drop_column("interactions", "mood")
