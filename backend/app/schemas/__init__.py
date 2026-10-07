"""Pydantic schemas —— 与 ``frontend/src/types/index.ts`` 逐字段对齐的线上契约。

本包是整个后端唯一允许定义 JSON 形状的地方；字段名用 snake_case，
通过 ``alias_generator=to_camel`` 输出 camelCase（规范 §77 / §59）。
"""

from __future__ import annotations

# 先导入与契约一一对应的模块（顺便把枚举值暴露出去，方便 seed 与测试复用）。
from app.models.enums import (
    AttachmentFileType,
    BorrowDirection,
    BorrowStatus,
    CircleLevel,
    CommitmentStatus,
    DatePrecision,
    InteractionSource,
    ParserKind,
    PreferenceCategory,
    RepeatType,
    UpdateStatus,
)
from app.schemas.ai import (
    CommitParseInput,
    CommitParseResult,
    ParsedBorrow,
    ParsedBorrowInput,
    ParsedCommitment,
    ParsedCommitmentInput,
    ParsedImportantDate,
    ParsedImportantDateInput,
    ParsedInteraction,
    ParsedPreference,
    ParsedPreferenceInput,
    ParsedUpdate,
    ParsedUpdateInput,
    ParseRequest,
    ParseResult,
    PersonCandidate,
)
from app.schemas.attachment import AttachmentRead
from app.schemas.auth import AuthSession, LoginInput, RegisterInput, UserRead
from app.schemas.borrow_record import BorrowRecordInput, BorrowRecordPatch, BorrowRecordRead
from app.schemas.commitment import CommitmentInput, CommitmentPatch, CommitmentRead
from app.schemas.common import CamelModel, PlainDate, UtcDatetime
from app.schemas.export import ExportPayload
from app.schemas.group import GroupInput, GroupPatch, GroupRead, GroupRef
from app.schemas.important_date import (
    ImportantDateInput,
    ImportantDateLite,
    ImportantDatePatch,
    ImportantDateRead,
)
from app.schemas.interaction import InteractionInput, InteractionPatch, InteractionRead
from app.schemas.memories import MemoriesPayload, MemoryItem, MemoryMonth, MemorySummary
from app.schemas.person import PersonDetail, PersonInput, PersonPatch, PersonRef, PersonSummary
from app.schemas.person_update import PersonUpdateInput, PersonUpdatePatch, PersonUpdateRead
from app.schemas.preference import PreferenceInput, PreferencePatch, PreferenceRead
from app.schemas.search import (
    SearchBorrowHit,
    SearchCommitmentHit,
    SearchMemoryHit,
    SearchPersonHit,
    SearchResults,
)
from app.schemas.today import (
    MemoryPrompt,
    TodayBorrowRecord,
    TodayCommitment,
    TodayImportantDate,
    TodayPayload,
    TodayYearMemory,
)

__all__ = [
    "AttachmentFileType",
    "AttachmentRead",
    "AuthSession",
    "BorrowDirection",
    "BorrowRecordInput",
    "BorrowRecordPatch",
    "BorrowRecordRead",
    "BorrowStatus",
    "CamelModel",
    "CircleLevel",
    "CommitParseInput",
    "CommitParseResult",
    "CommitmentInput",
    "CommitmentPatch",
    "CommitmentRead",
    "CommitmentStatus",
    "DatePrecision",
    "ExportPayload",
    "GroupInput",
    "GroupPatch",
    "GroupRead",
    "GroupRef",
    "ImportantDateInput",
    "ImportantDateLite",
    "ImportantDatePatch",
    "ImportantDateRead",
    "InteractionInput",
    "InteractionPatch",
    "InteractionRead",
    "InteractionSource",
    "LoginInput",
    "MemoriesPayload",
    "MemoryItem",
    "MemoryMonth",
    "MemoryPrompt",
    "MemorySummary",
    "ParseRequest",
    "ParseResult",
    "ParserKind",
    "ParsedBorrow",
    "ParsedBorrowInput",
    "ParsedCommitment",
    "ParsedCommitmentInput",
    "ParsedImportantDate",
    "ParsedImportantDateInput",
    "ParsedInteraction",
    "ParsedPreference",
    "ParsedPreferenceInput",
    "ParsedUpdate",
    "ParsedUpdateInput",
    "PersonCandidate",
    "PersonDetail",
    "PersonInput",
    "PersonPatch",
    "PersonRef",
    "PersonSummary",
    "PersonUpdateInput",
    "PersonUpdatePatch",
    "PersonUpdateRead",
    "PlainDate",
    "PreferenceCategory",
    "PreferenceInput",
    "PreferencePatch",
    "PreferenceRead",
    "RegisterInput",
    "RepeatType",
    "SearchBorrowHit",
    "SearchCommitmentHit",
    "SearchMemoryHit",
    "SearchPersonHit",
    "SearchResults",
    "TodayBorrowRecord",
    "TodayCommitment",
    "TodayImportantDate",
    "TodayPayload",
    "TodayYearMemory",
    "UpdateStatus",
    "UserRead",
    "UtcDatetime",
]
