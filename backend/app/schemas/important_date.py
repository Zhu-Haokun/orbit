"""ImportantDate schema（``ImportantDate`` / ``ImportantDateLite``，规范 §24 §44）。"""

from __future__ import annotations

import uuid
from datetime import date  # noqa: F401  (保留：PlainDate 的语义来源，方便阅读)

from pydantic import Field

from app.models.enums import DatePrecision, RepeatType
from app.schemas.common import CamelModel, PlainDate, UtcDatetime


class ImportantDateLite(CamelModel):
    """嵌在 ``PersonSummary.nextImportantDate`` 里的精简版。"""

    id: uuid.UUID
    title: str
    date: PlainDate | None = None
    date_text: str | None = None
    date_precision: DatePrecision = DatePrecision.EXACT
    repeat_type: RepeatType = RepeatType.NONE


class ImportantDateRead(ImportantDateLite):
    person_id: uuid.UUID
    notes: str | None = None
    created_at: UtcDatetime


class ImportantDateInput(CamelModel):
    person_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    # 字段名 date 会遮蔽模块里的 date 类型，所以这里统一用 PlainDate 别名，
    # 不要写成 ``date | None``（Pydantic 解析字符串注解时会把 date 当成字段默认值 None）。
    date: PlainDate | None = None
    date_text: str | None = Field(default=None, max_length=120)
    date_precision: DatePrecision = DatePrecision.EXACT
    repeat_type: RepeatType = RepeatType.NONE
    notes: str | None = None


class ImportantDatePatch(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    date: PlainDate | None = None
    date_text: str | None = Field(default=None, max_length=120)
    date_precision: DatePrecision | None = None
    repeat_type: RepeatType | None = None
    notes: str | None = None
