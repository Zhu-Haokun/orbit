"""附件 schema（``Attachment``，规范 §44 / §57）。"""

from __future__ import annotations

import uuid

from app.models.enums import AttachmentFileType
from app.schemas.common import CamelModel, UtcDatetime


class AttachmentRead(CamelModel):
    """一条互动上的一张图片 / 一个文件。"""

    id: uuid.UUID
    interaction_id: uuid.UUID
    file_type: AttachmentFileType
    file_url: str
    created_at: UtcDatetime
