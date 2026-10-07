"""Memories schema（``MemoriesPayload``，规范 §34）。

只回答“那段时间发生了什么”，不做排名、不评“最重要的人”（§34.4）。
"""

from __future__ import annotations

import uuid

from pydantic import Field

from app.schemas.attachment import AttachmentRead
from app.schemas.common import CamelModel, PlainDate
from app.schemas.memory_comment import MemoryCommentRead
from app.schemas.person import PersonRef


class MemoryItem(CamelModel):
    interaction_id: uuid.UUID
    title: str
    content: str
    date: PlainDate
    location: str | None = None
    people: list[PersonRef] = Field(default_factory=list)
    group_names: list[str] = Field(default_factory=list)
    attachments: list[AttachmentRead] = Field(default_factory=list)
    #: 回看时留下的评论；记录时选的心情；是否为「独处」记录。
    comments: list[MemoryCommentRead] = Field(default_factory=list)
    mood: str | None = None
    is_self: bool = False


class MemoryMonth(CamelModel):
    key: str
    year: int
    month: int
    label: str
    items: list[MemoryItem] = Field(default_factory=list)


class MemorySummary(CamelModel):
    year: int | None = None
    interaction_count: int = 0
    people_count: int = 0
    place_count: int = 0


class MemoriesPayload(CamelModel):
    year: int | None = None
    years: list[int] = Field(default_factory=list)
    months: list[MemoryMonth] = Field(default_factory=list)
    summary: MemorySummary = Field(default_factory=MemorySummary)
