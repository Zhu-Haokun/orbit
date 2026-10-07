"""星系路由（规范 §45 Groups / §47.1 星系）。

星图上的「宿舍 / 摄影社 / 实验室 / 高中 / 家人」都是这里的行，
``GET`` 会带上 ``personCount`` 供前端 Chips 显示。
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.models.group import Group, people_groups
from app.models.person import Person
from app.schemas.group import GroupInput, GroupPatch, GroupRead

router = APIRouter(prefix="/api/groups", tags=["groups"])

_NOT_FOUND = "没有找到这个星系。"
_DUPLICATE = "已经有一个同名的星系了。"
_HAS_PEOPLE = "这个星系里还有人，先把他移出去再删除。"


def _counts(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = db.execute(
        sa.select(people_groups.c.group_id, sa.func.count(people_groups.c.person_id))
        .join(Person, Person.id == people_groups.c.person_id)
        .where(Person.user_id == user_id)
        .group_by(people_groups.c.group_id)
    ).all()
    return {group_id: int(count) for group_id, count in rows}


def _load(db: Session, user_id: uuid.UUID, group_id: uuid.UUID) -> Group:
    group = db.get(Group, group_id)
    if group is None or group.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return group


def _assert_unique_name(db: Session, user_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None) -> None:
    stmt = sa.select(Group.id).where(Group.user_id == user_id, Group.name == name)
    if exclude is not None:
        stmt = stmt.where(Group.id != exclude)
    if db.execute(stmt).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE)


@router.get("", response_model=list[GroupRead])
def list_groups(db: DbSession, current_user: CurrentUser) -> list[dict[str, object]]:
    """全部星系，按 ``sortOrder`` 排列，并带上人数。"""
    groups = (
        db.execute(
            sa.select(Group).where(Group.user_id == current_user.id).order_by(Group.sort_order.asc(), Group.name.asc())
        )
        .scalars()
        .all()
    )
    counts = _counts(db, current_user.id)
    return [
        {
            "id": group.id,
            "name": group.name,
            "icon": group.icon,
            "sort_order": group.sort_order,
            "person_count": counts.get(group.id, 0),
        }
        for group in groups
    ]


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
def create_group(payload: GroupInput, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="星系需要一个名字。")
    _assert_unique_name(db, current_user.id, name)

    # 没指定顺序就追加到末尾，否则新建的星系会挤到最前面去。
    if payload.sort_order is None:
        current_max = db.execute(
            sa.select(sa.func.max(Group.sort_order)).where(Group.user_id == current_user.id)
        ).scalar()
        sort_order = (current_max + 1) if current_max is not None else 0
    else:
        sort_order = payload.sort_order

    group = Group(user_id=current_user.id, name=name, icon=payload.icon, sort_order=sort_order)
    db.add(group)
    db.commit()
    db.refresh(group)
    return {
        "id": group.id,
        "name": group.name,
        "icon": group.icon,
        "sort_order": group.sort_order,
        "person_count": 0,
    }


@router.patch("/{group_id}", response_model=GroupRead)
def update_group(
    group_id: uuid.UUID,
    payload: GroupPatch,
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, object]:
    group = _load(db, current_user.id, group_id)
    changes = payload.model_dump(exclude_unset=True, by_alias=False)
    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()
        _assert_unique_name(db, current_user.id, changes["name"], exclude=group.id)
    for field, value in changes.items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    return {
        "id": group.id,
        "name": group.name,
        "icon": group.icon,
        "sort_order": group.sort_order,
        "person_count": _counts(db, current_user.id).get(group.id, 0),
    }


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    """删除星系。里面还有人时先拒绝，避免用户误删掉一整组关系。"""
    group = _load(db, current_user.id, group_id)
    count = _counts(db, current_user.id).get(group.id, 0)
    if count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_HAS_PEOPLE)

    db.execute(sa.delete(people_groups).where(people_groups.c.group_id == group.id))
    db.delete(group)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
