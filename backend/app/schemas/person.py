"""Person schema（``PersonSummary`` / ``PersonDetail`` / ``PersonInput``，规范 §44 §21）。

派生字段（``lastInteractionAt`` / ``interactionCount`` / ``latestUpdate`` /
``openCommitmentCount`` / ``nextImportantDate``）由
:mod:`app.services.person_service` 在返回前挂到 ORM 对象上，
这里只按契约声明形状。
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import Field

from app.models.enums import CircleLevel
from app.schemas.borrow_record import BorrowRecordRead
from app.schemas.commitment import CommitmentRead
from app.schemas.common import CamelModel, PlainDate, UtcDatetime
from app.schemas.group import GroupRef
from app.schemas.important_date import ImportantDateLite, ImportantDateRead
from app.schemas.interaction import InteractionRead
from app.schemas.person_update import PersonUpdateRead
from app.schemas.preference import PreferenceRead


class PersonRef(CamelModel):
    """聚合载荷里对一个人的最小引用。"""

    id: uuid.UUID
    name: str
    avatar_url: str | None = None
    relationship_label: str | None = None


class PersonSummary(CamelModel):
    """星图上的一颗星，带前端需要的派生信息。"""

    id: uuid.UUID
    name: str
    nickname: str | None = None
    avatar_url: str | None = None
    relationship_label: str | None = None
    met_at: PlainDate | None = None
    notes: str | None = None
    circle_level: CircleLevel = CircleLevel.NORMAL
    groups: list[GroupRef] = Field(default_factory=list)
    created_at: UtcDatetime
    updated_at: UtcDatetime

    #: 「我」自己的那一条。星图中心用它，/api/people 不返回它。
    is_self: bool = False
    mbti: str | None = None
    interests: str | None = None

    last_interaction_at: UtcDatetime | None = None
    interaction_count: int = 0
    latest_update: str | None = None
    open_commitment_count: int = 0
    next_important_date: ImportantDateLite | None = None


class PersonDetail(PersonSummary):
    """完整档案（§21.2 的内容顺序由前端负责，这里只保证数据齐全）。"""

    updates: list[PersonUpdateRead] = Field(default_factory=list)
    commitments: list[CommitmentRead] = Field(default_factory=list)
    important_dates: list[ImportantDateRead] = Field(default_factory=list)
    preferences: list[PreferenceRead] = Field(default_factory=list)
    borrow_records: list[BorrowRecordRead] = Field(default_factory=list)
    interactions: list[InteractionRead] = Field(default_factory=list)


class PersonInput(CamelModel):
    """新建人物；``groupIds`` 是完整替换语义（§20）。"""

    name: str = Field(min_length=1, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=512)
    relationship_label: str | None = Field(default=None, max_length=120)
    met_at: date | None = None
    notes: str | None = None
    circle_level: CircleLevel = CircleLevel.NORMAL
    group_ids: list[uuid.UUID] = Field(default_factory=list)


class PersonPatch(CamelModel):
    """部分更新；只有请求里出现的字段才会被写入。"""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=512)
    relationship_label: str | None = Field(default=None, max_length=120)
    met_at: date | None = None
    notes: str | None = None
    circle_level: CircleLevel | None = None
    group_ids: list[uuid.UUID] | None = None
    mbti: str | None = Field(default=None, max_length=8)
    interests: str | None = None
