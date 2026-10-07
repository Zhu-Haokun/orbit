"""interactions.event_id -- shared events

Revision ID: 0006_event_id
Revises: 0005_interaction_draft
Create Date: 2026-10-06

A multi-person record creates one interaction per person. Those rows are the same
shared experience, so they now carry a common ``event_id``.

That id is what the star map uses to draw **links between people**: two people are
connected only when they actually appear in the same record. Before this, the
galaxy chained together everyone in a group whether or not they had ever met,
which is exactly the wrong signal.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_event_id"
down_revision: str | None = "0005_interaction_draft"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_LENGTH = 36


def upgrade() -> None:
    op.add_column("interactions", sa.Column("event_id", sa.CHAR(UUID_LENGTH), nullable=True))
    op.create_index("ix_interactions_event_id", "interactions", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_interactions_event_id", table_name="interactions")
    op.drop_column("interactions", "event_id")
