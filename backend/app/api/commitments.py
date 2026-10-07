"""未完待续路由（规范 §23 / §44 commitments）。

状态流转：``open`` / ``later`` → ``done`` 时写入 ``completedAt``；
重新打开（``done`` → ``open``）时清掉它，保证前端能正确显示“✓ 已完成”。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.models.commitment import Commitment
from app.models.enums import CommitmentStatus
from app.models.person import Person
from app.schemas.commitment import CommitmentInput, CommitmentPatch, CommitmentRead
from app.services import person_service

router = APIRouter(prefix="/api/commitments", tags=["commitments"])

_NOT_FOUND = "没有找到这件事。"
_PERSON_NOT_FOUND = "没有找到这个人的记录。"


def _load(db: Session, user_id: uuid.UUID, commitment_id: uuid.UUID) -> Commitment:
    row = db.get(Commitment, commitment_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


def _apply_status(row: Commitment, new_status: CommitmentStatus | None) -> None:
    """状态变化时同步 ``completed_at``：完成打点，重新打开则清空。"""
    if new_status is None or new_status == row.status:
        return
    row.status = new_status
    row.completed_at = datetime.now(UTC) if new_status == CommitmentStatus.DONE else None


@router.get("", response_model=list[CommitmentRead])
def list_commitments(
    db: DbSession,
    current_user: CurrentUser,
    person_id: uuid.UUID | None = Query(default=None, alias="personId"),
    status_filter: CommitmentStatus | None = Query(default=None, alias="status"),
) -> list[Commitment]:
    stmt = sa.select(Commitment).where(Commitment.user_id == current_user.id)
    if person_id is not None:
        person = db.get(Person, person_id)
        if person is None or person.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)
        stmt = stmt.where(Commitment.person_id == person_id)
    if status_filter is not None:
        stmt = stmt.where(Commitment.status == status_filter)

    stmt = stmt.order_by(
        Commitment.status.asc(),
        Commitment.due_date.asc().nullslast(),
        Commitment.created_at.desc(),
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=CommitmentRead, status_code=status.HTTP_201_CREATED)
def create_commitment(payload: CommitmentInput, db: DbSession, current_user: CurrentUser) -> Commitment:
    person = db.get(Person, payload.person_id)
    if person is None or person.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)

    row = Commitment(
        user_id=current_user.id,
        person_id=person.id,
        content=payload.content.strip(),
        due_date=payload.due_date,
        due_text=payload.due_text,
        status=payload.status or CommitmentStatus.OPEN,
        source_interaction_id=payload.source_interaction_id,
    )
    if row.status == CommitmentStatus.DONE:
        row.completed_at = datetime.now(UTC)
    db.add(row)
    person_service.touch_person(person)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{commitment_id}", response_model=CommitmentRead)
def update_commitment(
    commitment_id: uuid.UUID,
    payload: CommitmentPatch,
    db: DbSession,
    current_user: CurrentUser,
) -> Commitment:
    row = _load(db, current_user.id, commitment_id)
    changes = payload.model_dump(exclude_unset=True, by_alias=False)

    new_status = changes.pop("status", None)
    if new_status is not None:
        _apply_status(row, CommitmentStatus(new_status))

    for field, value in changes.items():
        if field == "content" and value is not None:
            value = str(value).strip()
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return row


@router.delete("/{commitment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_commitment(commitment_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    row = _load(db, current_user.id, commitment_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
