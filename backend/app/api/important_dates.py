"""重要日期路由（规范 §24 / §44 important_dates）。

``GET /api/important-dates?personId=`` 列表；``POST`` 新建；``PATCH`` / ``DELETE``。
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.models.important_date import ImportantDate
from app.models.person import Person
from app.schemas.important_date import (
    ImportantDateInput,
    ImportantDatePatch,
    ImportantDateRead,
)

router = APIRouter(prefix="/api/important-dates", tags=["important-dates"])

_NOT_FOUND = "没有找到这个日期。"
_PERSON_NOT_FOUND = "没有找到这个人的记录。"


def _load(db: Session, user_id: uuid.UUID, date_id: uuid.UUID) -> ImportantDate:
    row = db.get(ImportantDate, date_id)
    person = db.get(Person, row.person_id) if row is not None else None
    if row is None or person is None or person.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


@router.get("", response_model=list[ImportantDateRead])
def list_important_dates(
    db: DbSession,
    current_user: CurrentUser,
    person_id: uuid.UUID | None = Query(default=None, alias="personId"),
) -> list[ImportantDate]:
    stmt = (
        sa.select(ImportantDate)
        .join(Person, Person.id == ImportantDate.person_id)
        .where(Person.user_id == current_user.id)
    )
    if person_id is not None:
        person = db.get(Person, person_id)
        if person is None or person.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)
        stmt = stmt.where(ImportantDate.person_id == person_id)
    return list(db.execute(stmt.order_by(ImportantDate.date.asc())).scalars().all())


@router.post("", response_model=ImportantDateRead, status_code=status.HTTP_201_CREATED)
def create_important_date(
    payload: ImportantDateInput,
    db: DbSession,
    current_user: CurrentUser,
) -> ImportantDate:
    person = db.get(Person, payload.person_id)
    if person is None or person.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)

    row = ImportantDate(
        person_id=person.id,
        title=payload.title.strip(),
        date=payload.date,
        date_text=payload.date_text,
        date_precision=payload.date_precision,
        repeat_type=payload.repeat_type,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{date_id}", response_model=ImportantDateRead)
def update_important_date(
    date_id: uuid.UUID,
    payload: ImportantDatePatch,
    db: DbSession,
    current_user: CurrentUser,
) -> ImportantDate:
    row = _load(db, current_user.id, date_id)
    for field, value in payload.model_dump(exclude_unset=True, by_alias=False).items():
        if field == "title" and value is not None:
            value = str(value).strip()
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{date_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_important_date(date_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    row = _load(db, current_user.id, date_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
