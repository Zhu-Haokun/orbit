"""人物路由里复用的两个小工具：解析 groupIds、判断互动是否属于我。"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.group import Group
from app.models.interaction import Interaction

_GROUP_NOT_FOUND = "有一个星系不存在了，刷新一下再试。"
_INTERACTION_NOT_FOUND = "没有找到这条记录。"


def resolve_group_ids(db: Session, user_id: uuid.UUID, group_ids: list[uuid.UUID]) -> list[Group]:
    """把请求里的 ``groupIds`` 换成 Group 行；出现别人的 id 就报错，不静默接受。"""
    if not group_ids:
        return []
    unique_ids = list(dict.fromkeys(group_ids))
    groups = db.execute(sa.select(Group).where(Group.user_id == user_id, Group.id.in_(unique_ids))).scalars().all()
    if len(groups) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_GROUP_NOT_FOUND)
    return list(groups)


def owned_interaction(db: Session, user_id: uuid.UUID, interaction_id: uuid.UUID) -> Interaction:
    """取一条属于自己的互动，否则 404。"""
    interaction = db.get(Interaction, interaction_id)
    if interaction is None or interaction.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INTERACTION_NOT_FOUND)
    return interaction


__all__ = ["owned_interaction", "resolve_group_ids"]
