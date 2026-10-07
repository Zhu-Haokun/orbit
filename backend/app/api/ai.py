"""AI 解析路由（规范 §31 / §32 / §45 / §46）。

``POST /api/ai/parse-interaction`` 只会返回“整理结果”，永远不返回技术错误：
没有 key、网络不通、模型返回垃圾，都会静默降级为内置规则解析器。
"""

from __future__ import annotations

from fastapi import APIRouter

from app.ai import service as ai_service
from app.core.deps import CurrentUser, DbSession
from app.schemas.ai import ParseRequest, ParseResult

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/parse-interaction", response_model=ParseResult)
def parse_interaction(
    payload: ParseRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ParseResult:
    """把一段自然语言整理成人物 / 互动 / 近况 / 重要日期 / 未完待续 / 借还。"""
    return ai_service.parse_interaction(db, current_user.id, payload)


__all__ = ["router"]
