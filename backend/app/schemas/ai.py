"""AI 解析 schema（``ParseRequest`` / ``ParseResult`` / ``CommitParseInput``，规范 §30 §45 §46）。"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field

from app.models.enums import (
    BorrowDirection,
    DatePrecision,
    ParserKind,
    PreferenceCategory,
    RepeatType,
    UpdateStatus,
)
from app.schemas.borrow_record import BorrowRecordRead
from app.schemas.commitment import CommitmentRead
from app.schemas.common import CamelModel, PlainDate
from app.schemas.important_date import ImportantDateRead
from app.schemas.interaction import InteractionInput, InteractionRead
from app.schemas.person_update import PersonUpdateRead
from app.schemas.preference import PreferenceRead


class PersonCandidate(CamelModel):
    """文本里出现的人。``id`` 为空表示库里还没有这个人，交给用户决定。"""

    id: uuid.UUID | None = None
    name: str
    confidence: float = 0.0


class ParsedInteraction(CamelModel):
    title: str
    content: str
    interaction_date: str
    location: str | None = None
    interaction_type: str | None = None


class ParsedUpdate(CamelModel):
    content: str


class ParsedCommitment(CamelModel):
    content: str
    due_date: str | None = None
    due_text: str | None = None


class ParsedImportantDate(CamelModel):
    title: str
    date: str | None = None
    date_text: str | None = None
    date_precision: DatePrecision = DatePrecision.EXACT
    repeat_type: RepeatType = RepeatType.NONE


class ParsedPreference(CamelModel):
    category: PreferenceCategory = PreferenceCategory.OTHER
    content: str


class ParsedBorrow(CamelModel):
    direction: BorrowDirection = BorrowDirection.LENT_TO
    item_name: str
    borrow_date: str | None = None


class ParseRequest(CamelModel):
    text: str
    selected_person_id: uuid.UUID | None = None
    reference_date: date


class ParseResult(CamelModel):
    """解析结果。无论走 LLM 还是规则，形状完全一致（§31 永不暴露技术错误）。"""

    parser: ParserKind = ParserKind.RULES
    person_candidates: list[PersonCandidate] = Field(default_factory=list)
    interaction: ParsedInteraction
    updates: list[ParsedUpdate] = Field(default_factory=list)
    commitments: list[ParsedCommitment] = Field(default_factory=list)
    important_dates: list[ParsedImportantDate] = Field(default_factory=list)
    preferences: list[ParsedPreference] = Field(default_factory=list)
    borrow_records: list[ParsedBorrow] = Field(default_factory=list)


class ParsedUpdateInput(CamelModel):
    content: str = Field(min_length=1)
    status: UpdateStatus = UpdateStatus.ACTIVE


class ParsedCommitmentInput(CamelModel):
    content: str = Field(min_length=1)
    due_date: datetime | None = None
    due_text: str | None = None


class ParsedImportantDateInput(CamelModel):
    title: str = Field(min_length=1)
    # 同 important_date.py：字段名 date 会遮蔽类型名，统一用 PlainDate。
    date: PlainDate | None = None
    date_text: str | None = None
    date_precision: DatePrecision = DatePrecision.EXACT
    repeat_type: RepeatType = RepeatType.NONE


class ParsedPreferenceInput(CamelModel):
    category: PreferenceCategory = PreferenceCategory.OTHER
    content: str = Field(min_length=1)


class ParsedBorrowInput(CamelModel):
    direction: BorrowDirection = BorrowDirection.LENT_TO
    item_name: str = Field(min_length=1)
    borrow_date: PlainDate | None = None


class CommitParseInput(CamelModel):
    """§30 确认保存时提交的聚合载荷；一次事务，全成或全不成。"""

    interaction: InteractionInput
    updates: list[ParsedUpdateInput] = Field(default_factory=list)
    commitments: list[ParsedCommitmentInput] = Field(default_factory=list)
    important_dates: list[ParsedImportantDateInput] = Field(default_factory=list)
    preferences: list[ParsedPreferenceInput] = Field(default_factory=list)
    borrow_records: list[ParsedBorrowInput] = Field(default_factory=list)
    attachment_urls: list[str] = Field(default_factory=list, max_length=6)
    #: 「先记下来」之后再整理时用：更新这一条已有的互动，而不是新建一条。
    interaction_id: uuid.UUID | None = None
    #: 一起经历的人。给了多个时，为每个人各建一条互动（内容相同）。
    person_ids: list[uuid.UUID] = Field(default_factory=list)


class CommitParseResult(CamelModel):
    interaction: InteractionRead
    updates: list[PersonUpdateRead] = Field(default_factory=list)
    commitments: list[CommitmentRead] = Field(default_factory=list)
    important_dates: list[ImportantDateRead] = Field(default_factory=list)
    preferences: list[PreferenceRead] = Field(default_factory=list)
    borrow_records: list[BorrowRecordRead] = Field(default_factory=list)
