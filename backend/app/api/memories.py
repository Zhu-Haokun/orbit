"""回忆路由（规范 §34 / §45）。

``GET /api/memories?year=&groupId=`` —— 按月的记忆流 + 年度摘要。
不做排名，也不评“最重要的人”（§34.4）。
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.schemas.memories import MemoriesPayload
from app.services import memories_service

router = APIRouter(prefix="/api", tags=["memories"])


@router.get("/memories", response_model=MemoriesPayload)
def read_memories(
    db: DbSession,
    current_user: CurrentUser,
    year: int | None = Query(default=None, ge=1900, le=2200),
    group_id: uuid.UUID | None = Query(default=None, alias="groupId"),
    location: str | None = Query(default=None, max_length=200, description="按地点筛选"),
    person_id: uuid.UUID | None = Query(default=None, alias="personId", description="按人物筛选"),
) -> dict[str, object]:
    """不传即表示"全部"；``location`` / ``personId`` 支持从索引栏点进来。"""
    return memories_service.build_memories(
        db,
        current_user.id,
        year=year,
        group_id=group_id,
        location=location,
        person_id=person_id,
    )


__all__ = ["router"]
