"""``groups`` 与 ``people_groups``（规范 §44 / §47.1 星系）。"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, uuid_pk

if TYPE_CHECKING:  # pragma: no cover
    from app.models.person import Person
    from app.models.user import User

#: 多对多连接表：一个人可以属于多个星系。
people_groups = sa.Table(
    "people_groups",
    Base.metadata,
    sa.Column("person_id", GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("group_id", GUID(), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
)


class Group(Base):
    """星系（宿舍 / 摄影社 / 实验室 / 高中 / 家人）。"""

    __tablename__ = "groups"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    icon: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)
    created_at: Mapped[sa.DateTime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="groups")
    people: Mapped[list[Person]] = relationship(secondary=people_groups, back_populates="groups", lazy="selectin")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Group {self.name}>"
