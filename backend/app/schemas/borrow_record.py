"""BorrowRecord schema（``BorrowRecord``，规范 §44 / §26 借还）。"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import Field

from app.models.enums import BorrowDirection, BorrowStatus
from app.schemas.common import CamelModel, PlainDate, UtcDatetime


class BorrowRecordRead(CamelModel):
    id: uuid.UUID
    person_id: uuid.UUID
    direction: BorrowDirection = BorrowDirection.LENT_TO
    item_name: str
    amount: str | None = None
    borrow_date: PlainDate
    expected_return_date: PlainDate | None = None
    status: BorrowStatus = BorrowStatus.OPEN
    notes: str | None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class BorrowRecordInput(CamelModel):
    person_id: uuid.UUID
    direction: BorrowDirection = BorrowDirection.LENT_TO
    item_name: str = Field(min_length=1, max_length=200)
    amount: str | None = Field(default=None, max_length=64)
    borrow_date: date
    expected_return_date: date | None = None
    status: BorrowStatus = BorrowStatus.OPEN
    notes: str | None = None


class BorrowRecordPatch(CamelModel):
    direction: BorrowDirection | None = None
    item_name: str | None = Field(default=None, min_length=1, max_length=200)
    amount: str | None = Field(default=None, max_length=64)
    borrow_date: date | None = None
    expected_return_date: date | None = None
    status: BorrowStatus | None = None
    notes: str | None = None
