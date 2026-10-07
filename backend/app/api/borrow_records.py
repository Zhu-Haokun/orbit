"""借还路由（规范 §26 / §44 borrow_records）。

``borrowDate`` 是 ``Date``（§59）：借东西只记到天，不需要时刻。
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.models.borrow_record import BorrowRecord
from app.models.enums import BorrowStatus
from app.models.person import Person
from app.schemas.borrow_record import (
    BorrowRecordInput,
    BorrowRecordPatch,
    BorrowRecordRead,
)

router = APIRouter(prefix="/api/borrow-records", tags=["borrow-records"])

_NOT_FOUND = "没有找到这条借还记录。"
_PERSON_NOT_FOUND = "没有找到这个人的记录。"


def _load(db: Session, user_id: uuid.UUID, record_id: uuid.UUID) -> BorrowRecord:
    row = db.get(BorrowRecord, record_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


@router.get("", response_model=list[BorrowRecordRead])
def list_borrow_records(
    db: DbSession,
    current_user: CurrentUser,
    person_id: uuid.UUID | None = Query(default=None, alias="personId"),
    status_filter: BorrowStatus | None = Query(default=None, alias="status"),
) -> list[BorrowRecord]:
    stmt = sa.select(BorrowRecord).where(BorrowRecord.user_id == current_user.id)
    if person_id is not None:
        person = db.get(Person, person_id)
        if person is None or person.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)
        stmt = stmt.where(BorrowRecord.person_id == person_id)
    if status_filter is not None:
        stmt = stmt.where(BorrowRecord.status == status_filter)
    return list(db.execute(stmt.order_by(BorrowRecord.borrow_date.desc())).scalars().all())


@router.post("", response_model=BorrowRecordRead, status_code=status.HTTP_201_CREATED)
def create_borrow_record(
    payload: BorrowRecordInput,
    db: DbSession,
    current_user: CurrentUser,
) -> BorrowRecord:
    person = db.get(Person, payload.person_id)
    if person is None or person.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)

    row = BorrowRecord(
        user_id=current_user.id,
        person_id=person.id,
        direction=payload.direction,
        item_name=payload.item_name.strip(),
        amount=payload.amount,
        borrow_date=payload.borrow_date,
        expected_return_date=payload.expected_return_date,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{record_id}", response_model=BorrowRecordRead)
def update_borrow_record(
    record_id: uuid.UUID,
    payload: BorrowRecordPatch,
    db: DbSession,
    current_user: CurrentUser,
) -> BorrowRecord:
    row = _load(db, current_user.id, record_id)
    for field, value in payload.model_dump(exclude_unset=True, by_alias=False).items():
        if field == "item_name" and value is not None:
            value = str(value).strip()
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_borrow_record(record_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    row = _load(db, current_user.id, record_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
