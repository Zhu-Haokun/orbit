"""interactions.is_draft

Revision ID: 0005_interaction_draft
Revises: 0004_memory_comments
Create Date: 2026-10-06

"先记下来" used to create a normal interaction, so an unorganised note showed up
in Memories straight away, and the list of pending notes lived only in React
state and vanished on navigation.

Giving the interaction an explicit draft flag fixes both:

* drafts are filtered out of Memories / Today / Search and out of the derived
  star map stats, so they read as "not finished yet";
* the pending list can be read back from the server, so it survives navigation
  and refresh until the user organises, edits or deletes it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_interaction_draft"
down_revision: str | None = "0004_memory_comments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interactions",
        sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_interactions_is_draft", "interactions", ["is_draft"])


def downgrade() -> None:
    op.drop_index("ix_interactions_is_draft", table_name="interactions")
    op.drop_column("interactions", "is_draft")
