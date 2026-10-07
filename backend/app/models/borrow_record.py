"""``borrow_records`` 表（规范 §44 borrow_records / §26 借还）。

``amount`` 在 §44 里写作 decimal，但前端契约把它定义为 ``string | null``
（金额只是随手记下的文本，例如“两张”或“50 块”），因此这里存字符串。
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, TimestampMixin, enum_column, uuid_pk
from app.models.enums import BorrowDirection, BorrowStatus

if TYPE_CHECKING:  # pragma: no cover
    from app.models.person import Person


class BorrowRecord(TimestampMixin, Base):
    """借出 / 借入的东西，例如借给林夕的 50mm 镜头。"""

    __tablename__ = "borrow_records"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), index=True, nullable=False
    )
    direction: Mapped[BorrowDirection] = mapped_column(
        enum_column(BorrowDirection, default=BorrowDirection.LENT_TO),
        default=BorrowDirection.LENT_TO,
        nullable=False,
    )
    item_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    amount: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    borrow_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    expected_return_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    status: Mapped[BorrowStatus] = mapped_column(
        enum_column(BorrowStatus, default=BorrowStatus.OPEN),
        default=BorrowStatus.OPEN,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    person: Mapped[Person] = relationship(back_populates="borrow_records", lazy="joined")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<BorrowRecord {self.item_name} {self.status}>"
