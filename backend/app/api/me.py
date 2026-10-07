"""「我」自己的档案（``/api/me``）。

设计：自己也是一条 ``people`` 行，只是 ``is_self = True``。
好处是「独处」记录、自己的时间轴、回忆、搜索全部复用现有逻辑 ——
它照样是一条 interaction，只是挂在"我"名下。

这一行对每个用户**唯一**，第一次访问时按需创建，用户不需要先"添加自己"。
"""

from __future__ import annotations

import sqlalchemy as sa
from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.models.person import Person
from app.schemas.person import PersonDetail, PersonPatch
from app.services import person_service

router = APIRouter(prefix="/api/me", tags=["me"])

DEFAULT_SELF_NAME = "我"


def get_or_create_self(db: DbSession, user_id) -> Person:
    """取出「我」那一行；没有就建一个。"""
    person = db.execute(
        sa.select(Person).where(Person.user_id == user_id, Person.is_self.is_(True))
    ).scalar_one_or_none()
    if person is not None:
        return person

    # 昵称优先用账号昵称，"我"只是兜底 —— 用户随时可以改。
    from app.models.user import User

    user = db.get(User, user_id)
    person = Person(
        user_id=user_id,
        name=(user.nickname if user and user.nickname else DEFAULT_SELF_NAME),
        is_self=True,
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.get("", response_model=PersonDetail)
def read_me(db: DbSession, current_user: CurrentUser) -> Person:
    """当前用户的自我档案。"""
    person = get_or_create_self(db, current_user.id)
    return person_service.get_detail(db, person)


@router.patch("", response_model=PersonDetail)
def update_me(payload: PersonPatch, db: DbSession, current_user: CurrentUser) -> Person:
    """只更新请求里出现的字段（``exclude_unset``）。"""
    person = get_or_create_self(db, current_user.id)
    data = payload.model_dump(exclude_unset=True)
    # 「我」没有星系，也永远不参与星图的圈层着色。
    data.pop("group_ids", None)
    data.pop("circle_level", None)
    for key, value in data.items():
        setattr(person, key, value)
    db.commit()
    db.refresh(person)
    return person_service.get_detail(db, person)
