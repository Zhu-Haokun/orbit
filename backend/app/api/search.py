"""搜索路由（规范 §35 / §45 Search）。

支持：person name / nickname / group / interaction title・content・location /
commitment / preference / borrow item。空查询返回空结果。
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.schemas.search import SearchResults
from app.services import search_service

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search", response_model=SearchResults)
def search(
    db: DbSession,
    current_user: CurrentUser,
    q: str = Query(default="", description="搜索关键词"),
) -> dict[str, object]:
    """按四类结果返回，前端分组展示并显示数量。"""
    return search_service.search(db, current_user.id, q)


__all__ = ["router"]
