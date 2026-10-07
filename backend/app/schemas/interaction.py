"""Interaction schema（``Interaction`` / ``InteractionInput``，规范 §44 / §28）。"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.models.enums import InteractionSource
from app.schemas.attachment import AttachmentRead
from app.schemas.common import CamelModel, UtcDatetime


class InteractionRead(CamelModel):
    """时间轴上的一条记录。"""

    id: uuid.UUID
    person_id: uuid.UUID
    title: str
    content: str
    interaction_date: UtcDatetime
    location: str | None = None
    interaction_type: str | None = None
    source: InteractionSource = InteractionSource.MANUAL
    #: 记录时选的心情表情，只存字符。
    mood: str | None = None
    #: 「先记下来」但还没整理：不进回忆 / 今天 / 搜索。
    is_draft: bool = False
    created_at: UtcDatetime
    updated_at: UtcDatetime
    attachments: list[AttachmentRead] = Field(default_factory=list)


class InteractionInput(CamelModel):
    """新建一条互动；``attachmentUrls`` 会转成 attachments 行（file_type=image）。

    ``personIds`` 用于"和好几个人一起"的共同回忆：给了多个 id 时，
    服务端会为每个人各建一条互动（内容相同、各自进各自的档案），
    这样每个人的时间轴都是完整的，也不需要引入多对多关系表。
    """

    person_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    interaction_date: datetime
    location: str | None = Field(default=None, max_length=200)
    interaction_type: str | None = Field(default=None, max_length=64)
    source: InteractionSource | None = None
    attachment_urls: list[str] = Field(default_factory=list, max_length=6)
    mood: str | None = Field(default=None, max_length=16)
    #: 由「先记下来」创建时置 True，整理完成后由 commit 置回 False。
    is_draft: bool = False
    #: 可选：一次记录同时属于多个人。
    person_ids: list[uuid.UUID] = Field(default_factory=list)


class InteractionPatch(CamelModel):
    """PATCH 不含 ``personId``：互动不会换人（§44 契约）。"""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    interaction_date: datetime | None = None
    location: str | None = Field(default=None, max_length=200)
    interaction_type: str | None = Field(default=None, max_length=64)
    source: InteractionSource | None = None
    attachment_urls: list[str] | None = Field(default=None, max_length=6)
    mood: str | None = Field(default=None, max_length=16)
    is_draft: bool | None = None
