"""``commitments`` 表（规范 §44 commitments / §23 未完待续）。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, TimestampMixin, enum_column, uuid_pk
from app.models.enums import CommitmentStatus

if TYPE_CHECKING:  # pragma: no cover
    from app.models.person import Person


class Commitment(TimestampMixin, Base):
    """用户自己答应过、或记下来还悬着的一件事。"""

    __tablename__ = "commitments"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    due_text: Mapped[str | None] = mapped_column(sa.String(120), nullable=True)
    status: Mapped[CommitmentStatus] = mapped_column(
        enum_column(CommitmentStatus, default=CommitmentStatus.OPEN),
        default=CommitmentStatus.OPEN,
        nullable=False,
    )
    source_interaction_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), sa.ForeignKey("interactions.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    # 多对一，直接 joined 取回，聚合查询里不需要额外的懒加载。
    person: Mapped[Person] = relationship(back_populates="commitments", lazy="joined")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Commitment {self.content[:12]} {self.status}>"
