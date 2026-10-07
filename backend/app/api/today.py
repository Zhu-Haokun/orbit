"""「今天」聚合路由（规范 §33 / §45 Today）。

只回答“今天有哪些与我在乎的人有关的信息值得看一眼”，
返回结构见 ``TodayPayload``；不出现催办、评分或“你应该联系谁”。
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.today import TodayPayload
from app.services import today_service

router = APIRouter(prefix="/api", tags=["today"])


@router.get("/today", response_model=TodayPayload)
def read_today(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    """今天的重要日期 / 未完待续 / 借还 / 值得回看的记忆。"""
    return today_service.build_today(db, current_user.id)


__all__ = ["router"]
