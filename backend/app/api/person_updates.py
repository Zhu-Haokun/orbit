"""最近近况路由（规范 §22 / §44 person_updates）。

``GET /api/people/{id}/updates`` 列表，``POST /api/updates`` 新建，
``PATCH`` / ``DELETE`` 走 ``/api/updates/{id}``。
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession, OwnedPerson
from app.models.enums import UpdateStatus
from app.models.person import Person
from app.models.person_update import PersonUpdate
from app.schemas.person_update import PersonUpdateInput, PersonUpdatePatch, PersonUpdateRead
from app.services import person_service

router = APIRouter(prefix="/api", tags=["updates"])

_NOT_FOUND = "没有找到这条近况。"
_PERSON_NOT_FOUND = "没有找到这个人的记录。"


def _load(db: Session, user_id: uuid.UUID, update_id: uuid.UUID) -> PersonUpdate:
    """近况没有 user_id，只能通过父级 person 校验归属。"""
    row = db.get(PersonUpdate, update_id)
    person = db.get(Person, row.person_id) if row is not None else None
    if row is None or person is None or person.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


@router.get("/people/{person_id}/updates", response_model=list[PersonUpdateRead])
def list_updates(db: DbSession, person: OwnedPerson) -> list[PersonUpdate]:
    return (
        db.execute(
            sa.select(PersonUpdate).where(PersonUpdate.person_id == person.id).order_by(PersonUpdate.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.post("/updates", response_model=PersonUpdateRead, status_code=status.HTTP_201_CREATED)
def create_update(payload: PersonUpdateInput, db: DbSession, current_user: CurrentUser) -> PersonUpdate:
    person = db.get(Person, payload.person_id)
    if person is None or person.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)

    row = PersonUpdate(
        person_id=person.id,
        content=payload.content.strip(),
        source_interaction_id=payload.source_interaction_id,
        status=payload.status or UpdateStatus.ACTIVE,
    )
    db.add(row)
    person_service.touch_person(person)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/updates/{update_id}", response_model=PersonUpdateRead)
def update_update(
    update_id: uuid.UUID,
    payload: PersonUpdatePatch,
    db: DbSession,
    current_user: CurrentUser,
) -> PersonUpdate:
    row = _load(db, current_user.id, update_id)
    for field, value in payload.model_dump(exclude_unset=True, by_alias=False).items():
        if field == "content" and value is not None:
            value = str(value).strip()
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/updates/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_update(update_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    row = _load(db, current_user.id, update_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
