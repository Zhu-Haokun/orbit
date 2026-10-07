"""偏好路由（规范 §25 / §44 preferences）。

偏好只能来自用户手动添加或用户明确确认的记录，绝不自动推断（§1 / §25）。
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.models.person import Person
from app.models.preference import Preference
from app.schemas.preference import PreferenceInput, PreferencePatch, PreferenceRead

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

_NOT_FOUND = "没有找到这条偏好。"
_PERSON_NOT_FOUND = "没有找到这个人的记录。"


def _load(db: Session, user_id: uuid.UUID, preference_id: uuid.UUID) -> Preference:
    row = db.get(Preference, preference_id)
    person = db.get(Person, row.person_id) if row is not None else None
    if row is None or person is None or person.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


@router.get("", response_model=list[PreferenceRead])
def list_preferences(
    db: DbSession,
    current_user: CurrentUser,
    person_id: uuid.UUID | None = Query(default=None, alias="personId"),
) -> list[Preference]:
    stmt = (
        sa.select(Preference).join(Person, Person.id == Preference.person_id).where(Person.user_id == current_user.id)
    )
    if person_id is not None:
        person = db.get(Person, person_id)
        if person is None or person.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)
        stmt = stmt.where(Preference.person_id == person_id)
    return list(db.execute(stmt.order_by(Preference.created_at.asc())).scalars().all())


@router.post("", response_model=PreferenceRead, status_code=status.HTTP_201_CREATED)
def create_preference(payload: PreferenceInput, db: DbSession, current_user: CurrentUser) -> Preference:
    person = db.get(Person, payload.person_id)
    if person is None or person.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PERSON_NOT_FOUND)

    row = Preference(
        person_id=person.id,
        category=payload.category,
        content=payload.content.strip(),
        source_interaction_id=payload.source_interaction_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{preference_id}", response_model=PreferenceRead)
def update_preference(
    preference_id: uuid.UUID,
    payload: PreferencePatch,
    db: DbSession,
    current_user: CurrentUser,
) -> Preference:
    row = _load(db, current_user.id, preference_id)
    for field, value in payload.model_dump(exclude_unset=True, by_alias=False).items():
        if field == "content" and value is not None:
            value = str(value).strip()
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{preference_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preference(preference_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    row = _load(db, current_user.id, preference_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
