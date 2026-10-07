"""Group schema（``Group`` / ``GroupInput`` / ``GroupRef``，规范 §44 / §47.1）。"""

from __future__ import annotations

import uuid

from pydantic import Field

from app.schemas.common import CamelModel


class GroupRead(CamelModel):
    """星系，附带其中的人数（前端 Chips 需要）。"""

    id: uuid.UUID
    name: str
    icon: str | None = None
    sort_order: int = 0
    person_count: int = 0


class GroupRef(CamelModel):
    """嵌在人物载荷里的极小星系引用。"""

    id: uuid.UUID
    name: str
    icon: str | None = None
    sort_order: int = 0


class GroupInput(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=64)
    #: 不传就由服务端追加到末尾；传 0 会被当成"没传"，所以这里默认 None。
    sort_order: int | None = None


class GroupPatch(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=64)
    sort_order: int | None = None
