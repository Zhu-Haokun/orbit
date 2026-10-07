"""``attachments`` 表（规范 §44 attachments / §57 图片）。"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, Base, enum_column, uuid_pk
from app.models.enums import AttachmentFileType

if TYPE_CHECKING:  # pragma: no cover
    from app.models.interaction import Interaction


class Attachment(Base):
    """一条互动上的图片 / 文件。V1 实际只产出图片（§57）。"""

    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = uuid_pk()
    interaction_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), sa.ForeignKey("interactions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_type: Mapped[AttachmentFileType] = mapped_column(
        enum_column(AttachmentFileType, default=AttachmentFileType.IMAGE),
        default=AttachmentFileType.IMAGE,
        nullable=False,
    )
    file_url: Mapped[str] = mapped_column(sa.String(512), nullable=False)
    created_at: Mapped[sa.DateTime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    interaction: Mapped[Interaction] = relationship(back_populates="attachments")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Attachment {self.file_url}>"
