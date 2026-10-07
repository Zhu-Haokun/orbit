"""``person_updates`` 表（规范 §44 person_updates / §22 最近近况）。

注意：这张表没有 ``user_id``，隔离只能通过父级 person 校验（§86）。
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, TimestampMixin, enum_column, uuid_pk
from app.models.enums import UpdateStatus

if TYPE_CHECKING:  # pragma: no cover
    from app.models.person import Person


class PersonUpdate(TimestampMixin, Base):
    """“她最近在准备教师资格证”这类近况。"""

    __tablename__ = "person_updates"

    id: Mapped[uuid.UUID] = uuid_pk()
    person_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_interaction_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), sa.ForeignKey("interactions.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[UpdateStatus] = mapped_column(
        enum_column(UpdateStatus, default=UpdateStatus.ACTIVE),
        default=UpdateStatus.ACTIVE,
        nullable=False,
    )

    person: Mapped[Person] = relationship(back_populates="updates")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<PersonUpdate {self.content[:12]}>"
