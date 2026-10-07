"""``interactions`` 表（规范 §44 interactions / §27 时间轴）。"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, TimestampMixin, enum_column, uuid_pk
from app.models.enums import InteractionSource

if TYPE_CHECKING:  # pragma: no cover
    from app.models.attachment import Attachment
    from app.models.memory_comment import MemoryComment
    from app.models.person import Person


def normalize_interaction_date(value: datetime | date | str) -> datetime:
    """把任何“某一天的记录”归一到当天 ``12:00:00 UTC``。

    前端只关心“哪一天”，而用户可能传 ``"2026-09-21"``、``"2026-09-21T00:00:00Z"``
    或本地时区的 ``2026-09-21T08:30:00+08:00``；统一到 UTC 正午后，
    在 UTC+8 回看仍然是同一个日历日（规范 §59：前端按本地时区展示）。
    """
    if isinstance(value, str):
        parsed = _parse_date_string(value)
        if parsed is None:
            raise ValueError(f"无法识别的日期：{value!r}")
        return datetime.combine(parsed, time(12, 0), tzinfo=UTC)
    day = value.date() if isinstance(value, datetime) else value
    return datetime.combine(day, time(12, 0), tzinfo=UTC)


def _parse_date_string(raw: str) -> date | None:
    text = raw.strip()
    if not text:
        return None
    normalized = text[:-1] + "+00:00" if text.endswith(("Z", "z")) else text
    try:
        return datetime.fromisoformat(normalized).date()
    except ValueError:
        pass
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


class Interaction(TimestampMixin, Base):
    """一次共同经历，时间轴上的一个点。"""

    __tablename__ = "interactions"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("people.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    content: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    interaction_date: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, index=True)
    location: Mapped[str | None] = mapped_column(sa.String(200), nullable=True)
    interaction_type: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    source: Mapped[InteractionSource] = mapped_column(
        enum_column(InteractionSource, default=InteractionSource.MANUAL),
        default=InteractionSource.MANUAL,
        nullable=False,
    )
    #: 记录时可选的一个心情表情。只存那个字符，不做解析也不做统计。
    mood: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)

    #: 「先记下来」但还没整理的原文。
    #: 草稿不进回忆、不进「今天」、不进搜索，也不参与星图的亮度与计数 ——
    #: 它只是"我先放这儿"，等用户整理或删除。整理后置为 False。
    is_draft: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False, index=True)

    #: 同一次共同经历的所有互动共享这个 id。
    #: 星图上"朋友之间的连线"就来自它 —— 只有真的同框过才会连起来。
    event_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)

    person: Mapped[Person] = relationship(back_populates="interactions", lazy="joined")
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="interaction",
        passive_deletes=True,
        lazy="selectin",
        order_by="Attachment.created_at",
    )
    comments: Mapped[list[MemoryComment]] = relationship(
        back_populates="interaction",
        passive_deletes=True,
        lazy="selectin",
        order_by="MemoryComment.created_at",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Interaction {self.title} {self.interaction_date:%Y-%m-%d}>"
