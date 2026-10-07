"""``preferences`` 表（规范 §44 preferences / §25 偏好）。

只记录用户明确写下的偏好，不自动推断（§1 / §25）。
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, enum_column, uuid_pk
from app.models.enums import PreferenceCategory

if TYPE_CHECKING:  # pragma: no cover
    from app.models.person import Person


class Preference(Base):
    __tablename__ = "preferences"

    id: Mapped[uuid.UUID] = uuid_pk()
    person_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category: Mapped[PreferenceCategory] = mapped_column(
        enum_column(PreferenceCategory, default=PreferenceCategory.OTHER),
        default=PreferenceCategory.OTHER,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    source_interaction_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), sa.ForeignKey("interactions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[sa.DateTime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    person: Mapped[Person] = relationship(back_populates="preferences")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Preference {self.category} {self.content}>"
