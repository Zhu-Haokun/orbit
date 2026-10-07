"""``users`` 表（规范 §44 users）。"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, uuid_pk

if TYPE_CHECKING:  # pragma: no cover - 仅类型检查
    from app.models.group import Group
    from app.models.person import Person


class User(TimestampMixin, Base):
    """一个 Orbit 用户。星图默认只有他自己可见（§87）。"""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    nickname: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(sa.String(512), nullable=True)

    people: Mapped[list[Person]] = relationship(back_populates="user", passive_deletes=True, lazy="selectin")
    groups: Mapped[list[Group]] = relationship(back_populates="user", passive_deletes=True, lazy="selectin")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<User {self.email}>"
