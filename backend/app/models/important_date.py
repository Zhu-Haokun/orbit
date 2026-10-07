"""``important_dates`` 表（规范 §44 important_dates / §24 重要日期）。

``date`` 是 ``Date`` 而不是 ``DateTime``：生日这类全天事件不携带时刻（§59）。
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, enum_column, uuid_pk
from app.models.enums import DatePrecision, RepeatType

if TYPE_CHECKING:  # pragma: no cover
    from app.models.person import Person


class ImportantDate(Base):
    """精确、只到月、季节或纯文本的重要日期（§24）。"""

    __tablename__ = "important_dates"

    id: Mapped[uuid.UUID] = uuid_pk()
    person_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    date_text: Mapped[str | None] = mapped_column(sa.String(120), nullable=True)
    date_precision: Mapped[DatePrecision] = mapped_column(
        enum_column(DatePrecision, default=DatePrecision.EXACT),
        default=DatePrecision.EXACT,
        nullable=False,
    )
    repeat_type: Mapped[RepeatType] = mapped_column(
        enum_column(RepeatType, default=RepeatType.NONE),
        default=RepeatType.NONE,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[sa.DateTime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    person: Mapped[Person] = relationship(back_populates="important_dates", lazy="joined")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ImportantDate {self.title} {self.date}>"
