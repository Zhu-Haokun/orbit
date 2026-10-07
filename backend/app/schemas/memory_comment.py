"""MemoryComment schema（规范 §34 回忆页）。"""

from __future__ import annotations

import uuid

from pydantic import Field

from app.schemas.common import CamelModel, UtcDatetime


class MemoryCommentRead(CamelModel):
    id: uuid.UUID
    interaction_id: uuid.UUID
    content: str
    emoji: str | None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class MemoryCommentInput(CamelModel):
    content: str = Field(min_length=1, max_length=500)
    emoji: str | None = Field(default=None, max_length=16)


class MemoryCommentPatch(CamelModel):
    content: str | None = Field(default=None, min_length=1, max_length=500)
    emoji: str | None = Field(default=None, max_length=16)
