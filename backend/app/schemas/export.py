"""导出 schema（``ExportPayload``，规范 §88）——“把属于你的东西还给你”。"""

from __future__ import annotations

from pydantic import Field

from app.schemas.auth import UserRead
from app.schemas.borrow_record import BorrowRecordRead
from app.schemas.commitment import CommitmentRead
from app.schemas.common import CamelModel, UtcDatetime
from app.schemas.group import GroupRead
from app.schemas.important_date import ImportantDateRead
from app.schemas.interaction import InteractionRead
from app.schemas.person import PersonSummary
from app.schemas.preference import PreferenceRead


class ExportPayload(CamelModel):
    """一次性带走：用户 + 人物 + 星系 + 全部记录。"""

    exported_at: UtcDatetime
    user: UserRead
    people: list[PersonSummary] = Field(default_factory=list)
    groups: list[GroupRead] = Field(default_factory=list)
    interactions: list[InteractionRead] = Field(default_factory=list)
    commitments: list[CommitmentRead] = Field(default_factory=list)
    important_dates: list[ImportantDateRead] = Field(default_factory=list)
    preferences: list[PreferenceRead] = Field(default_factory=list)
    borrow_records: list[BorrowRecordRead] = Field(default_factory=list)
