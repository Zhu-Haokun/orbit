"""``people`` 表（规范 §44 people）——星图上的一个人。"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, TimestampMixin, enum_column, uuid_pk
from app.models.enums import CircleLevel
from app.models.group import people_groups

if TYPE_CHECKING:  # pragma: no cover
    from app.models.borrow_record import BorrowRecord
    from app.models.commitment import Commitment
    from app.models.group import Group
    from app.models.important_date import ImportantDate
    from app.models.interaction import Interaction
    from app.models.person_update import PersonUpdate
    from app.models.preference import Preference
    from app.models.user import User


class Person(TimestampMixin, Base):
    """一个人在用户星图中的位置与背景。

    派生字段（最近互动时间、未完成数量……）不落库，由
    :mod:`app.services.person_service` 在响应前算好（规范 §44 只定义原始列）。
    """

    __tablename__ = "people"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    nickname: Mapped[str | None] = mapped_column(sa.String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(sa.String(512), nullable=True)
    relationship_label: Mapped[str | None] = mapped_column(sa.String(120), nullable=True)
    met_at: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    circle_level: Mapped[CircleLevel] = mapped_column(
        enum_column(CircleLevel, default=CircleLevel.NORMAL),
        default=CircleLevel.NORMAL,
        nullable=False,
    )

    #: 「我」自己也是一条 person，只是不出现在 /api/people 里，单独走 /api/me。
    #: 这样「独处」记录、自己的时间轴、回忆、搜索全部复用现有逻辑。
    is_self: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False, index=True)

    #: 自我档案：MBTI 与爱好（逗号分隔），都是用户自己填的，不做任何推断。
    mbti: Mapped[str | None] = mapped_column(sa.String(8), nullable=True)
    interests: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="people")
    groups: Mapped[list[Group]] = relationship(secondary=people_groups, back_populates="people", lazy="selectin")
    interactions: Mapped[list[Interaction]] = relationship(
        back_populates="person", passive_deletes=True, lazy="selectin"
    )
    updates: Mapped[list[PersonUpdate]] = relationship(back_populates="person", passive_deletes=True, lazy="selectin")
    commitments: Mapped[list[Commitment]] = relationship(back_populates="person", passive_deletes=True, lazy="selectin")
    important_dates: Mapped[list[ImportantDate]] = relationship(
        back_populates="person", passive_deletes=True, lazy="selectin"
    )
    preferences: Mapped[list[Preference]] = relationship(back_populates="person", passive_deletes=True, lazy="selectin")
    borrow_records: Mapped[list[BorrowRecord]] = relationship(
        back_populates="person", passive_deletes=True, lazy="selectin"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Person {self.name}>"
