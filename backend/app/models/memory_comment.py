"""``memory_comments`` 表 —— 回看某段回忆时随手留下的一句话。

和互动本身分开：互动是"当时发生了什么"，评论是"现在回头看，我想说什么"。
所以它有自己的时间戳，不修改原记录（规范 §34 的回忆页是"重新进入一段经历"）。

``emoji`` 是可选的单个表情，用来表达此刻的心情 —— 不做解析，不做统计。
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, TimestampMixin, uuid_pk

if TYPE_CHECKING:  # pragma: no cover
    from app.models.interaction import Interaction


class MemoryComment(TimestampMixin, Base):
    """一条回忆下面的评论。"""

    __tablename__ = "memory_comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    interaction_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        sa.ForeignKey("interactions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    #: 可选的心情表情，只存用户选的那一个字符。
    emoji: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)

    interaction: Mapped[Interaction] = relationship(back_populates="comments")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MemoryComment {self.content[:20]!r}>"
