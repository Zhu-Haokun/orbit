"""Search schema（``SearchResults``，规范 §35）。

四类结果分类返回，前端分组展示并统计数量（§35.2）。
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.borrow_record import BorrowRecordRead
from app.schemas.commitment import CommitmentRead
from app.schemas.common import CamelModel
from app.schemas.interaction import InteractionRead
from app.schemas.person import PersonRef, PersonSummary


class SearchPersonHit(CamelModel):
    person: PersonSummary
    matched_in: list[str] = Field(default_factory=list)


class SearchMemoryHit(CamelModel):
    interaction: InteractionRead
    person: PersonRef | None = None


class SearchCommitmentHit(CamelModel):
    commitment: CommitmentRead
    person: PersonRef | None = None


class SearchBorrowHit(CamelModel):
    borrow_record: BorrowRecordRead
    person: PersonRef | None = None


class SearchResults(CamelModel):
    query: str = ""
    people: list[SearchPersonHit] = Field(default_factory=list)
    memories: list[SearchMemoryHit] = Field(default_factory=list)
    commitments: list[SearchCommitmentHit] = Field(default_factory=list)
    borrow_records: list[SearchBorrowHit] = Field(default_factory=list)
    total: int = 0
