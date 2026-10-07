"""星图的"共同经历"连线。

人和人之间**只有真的同框过才会连起来**：同一条 ``event_id`` 下的两个人
就是一起经历过一件事。之前星图把同一个星系的人按相邻顺序串成链，
那是"被分到同一组"，不是"一起做过什么" —— 信号是错的。

只返回事实（谁和谁、一起几次），不返回任何亲密度或排名。
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

import sqlalchemy as sa
from fastapi import APIRouter
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.models.interaction import Interaction
from app.schemas.common import CamelModel

router = APIRouter(prefix="/api", tags=["galaxy"])


class SharedEventLink(CamelModel):
    source: uuid.UUID
    target: uuid.UUID
    #: 一起经历过几次。只陈述次数，不做任何评价。
    count: int


def _shared_links(db: Session, user_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = db.execute(
        sa.select(Interaction.event_id, Interaction.person_id)
        .where(
            Interaction.user_id == user_id,
            Interaction.event_id.is_not(None),
            Interaction.is_draft.is_(False),
        )
        .distinct()
    ).all()

    by_event: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for event_id, person_id in rows:
        by_event[event_id].add(person_id)

    pair_counts: dict[tuple[uuid.UUID, uuid.UUID], int] = defaultdict(int)
    for people in by_event.values():
        ordered = sorted(people, key=str)
        for index, first in enumerate(ordered):
            for second in ordered[index + 1 :]:
                pair_counts[(first, second)] += 1

    return [
        {"source": source, "target": target, "count": count}
        for (source, target), count in sorted(pair_counts.items(), key=lambda kv: -kv[1])
    ]


@router.get("/galaxy/links", response_model=list[SharedEventLink])
def read_galaxy_links(
    db: DbSession,
    current_user: CurrentUser,
) -> list[dict[str, Any]]:
    """所有"一起出现过"的人对。星图只画这些线。"""
    return _shared_links(db, current_user.id)


__all__ = ["router"]
