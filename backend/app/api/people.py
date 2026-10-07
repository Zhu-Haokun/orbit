"""人物路由（规范 §20 / §21 / §45 People）。

* ``GET /api/people?group=&search=`` 星图与列表共用
* ``POST /api/people`` / ``PATCH`` 支持 ``groupIds`` 完整替换
* ``DELETE`` 走 §58 的“删除人物与所有相关记录”
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api._person_helpers import resolve_group_ids
from app.core.deps import CurrentUser, DbSession, OwnedPerson
from app.models.person import Person
from app.schemas.person import PersonDetail, PersonInput, PersonPatch, PersonSummary
from app.services import person_service

router = APIRouter(prefix="/api/people", tags=["people"])

_MISSING_NAME = "给这个人留一个称呼吧。"


@router.get("", response_model=list[PersonSummary])
def list_people(
    db: DbSession,
    current_user: CurrentUser,
    group: uuid.UUID | None = Query(default=None, description="按星系过滤"),
    search: str | None = Query(default=None, description="按姓名 / 昵称 / 关系标签搜索"),
) -> list[Person]:
    """星图上所有属于当前用户的人。"""
    return person_service.load_summaries(db, current_user.id, group_id=group, search=search)


@router.post("", response_model=PersonDetail, status_code=status.HTTP_201_CREATED)
def create_person(payload: PersonInput, db: DbSession, current_user: CurrentUser) -> Person:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_MISSING_NAME)

    groups = resolve_group_ids(db, current_user.id, payload.group_ids)
    person = Person(
        user_id=current_user.id,
        name=name,
        nickname=payload.nickname,
        avatar_url=payload.avatar_url,
        relationship_label=payload.relationship_label,
        met_at=payload.met_at,
        notes=payload.notes,
        circle_level=payload.circle_level,
    )
    person.groups = groups
    db.add(person)
    db.commit()
    db.refresh(person)
    return person_service.get_detail(db, person)


@router.get("/{person_id}", response_model=PersonDetail)
def read_person(db: DbSession, person: OwnedPerson) -> Person:
    """完整档案：近况 / 未完待续 / 重要日期 / 偏好 / 借还 / 时间轴。"""
    return person_service.get_detail(db, person)


@router.patch("/{person_id}", response_model=PersonDetail)
def update_person(
    payload: PersonPatch,
    db: DbSession,
    current_user: CurrentUser,
    person: OwnedPerson,
) -> Person:
    """部分更新；``groupIds`` 一旦出现就是完整替换语义。"""
    changes = payload.model_dump(exclude_unset=True, exclude={"group_ids"}, by_alias=False)
    if "name" in changes:
        if changes["name"] is None or not str(changes["name"]).strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_MISSING_NAME)
        changes["name"] = str(changes["name"]).strip()

    group_ids = None
    if "group_ids" in payload.model_fields_set and payload.group_ids is not None:
        group_ids = [group.id for group in resolve_group_ids(db, current_user.id, payload.group_ids)]

    person_service.update_person(db, current_user.id, person, changes, group_ids)
    db.commit()
    db.refresh(person)
    return person_service.get_detail(db, person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(db: DbSession, person: OwnedPerson) -> Response:
    """§58：删除人物与所有相关记录。此操作不可撤销。"""
    person_service.delete_person(db, person)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
