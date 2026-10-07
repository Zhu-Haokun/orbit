"""Today schema（``TodayPayload``，规范 §33 / §45 Today）。

只呈现“值得看一眼”的信息，不含任何催促或评分（§5.1 / §5.2 / §33.5）。
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.borrow_record import BorrowRecordRead
from app.schemas.commitment import CommitmentRead
from app.schemas.common import CamelModel, PlainDate, UtcDatetime
from app.schemas.important_date import ImportantDateRead
from app.schemas.person import PersonRef


class TodayYearMemory(CamelModel):
    """§33.3 “去年你记录：送了她一本摄影集”。"""

    title: str
    content: str
    date: UtcDatetime


class TodayImportantDate(ImportantDateRead):
    person: PersonRef
    is_today: bool = False
    in_days: int = 0
    last_year_memory: TodayYearMemory | None = None


class TodayCommitment(CommitmentRead):
    person: PersonRef
    recorded_at: UtcDatetime | None = None


class TodayBorrowRecord(BorrowRecordRead):
    person: PersonRef


class MemoryPrompt(CamelModel):
    """§33.5 “有一阵子没有新的记录”——只陈述，不催促。"""

    person: PersonRef
    last_interaction_at: UtcDatetime | None = None
    last_interaction_title: str | None = None
    last_interaction_content: str | None = None
    days_since: int | None = None


class TodayPayload(CamelModel):
    date: PlainDate
    headline_count: int = 0
    important_dates: list[TodayImportantDate] = Field(default_factory=list)
    commitments: list[TodayCommitment] = Field(default_factory=list)
    borrow_records: list[TodayBorrowRecord] = Field(default_factory=list)
    memory_prompts: list[MemoryPrompt] = Field(default_factory=list)
