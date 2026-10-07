"""导出路由（规范 §36.2 / §88）。

* ``GET /api/export/json`` —— 完整快照，形状就是 ``ExportPayload``
* ``GET /api/export/csv`` —— 一条互动一行，带 ``attachment`` 文件名头
"""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.deps import CurrentUser, DbSession
from app.schemas.export import ExportPayload
from app.services import export_service

router = APIRouter(prefix="/api/export", tags=["export"])

CSV_FILENAME = "orbit-export.csv"


@router.get("/json", response_model=ExportPayload)
def export_json(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    """导出全部数据；这是用户自己的东西，结构不做裁剪。"""
    return export_service.build_export(db, current_user)


@router.get("/csv")
def export_csv(db: DbSession, current_user: CurrentUser) -> Response:
    """一条互动一行的扁平 CSV，方便用户直接扔进表格。"""
    content = export_service.build_csv(db, current_user)
    return Response(
        # BOM 让 Excel 正确识别 UTF-8 中文。
        content="\ufeff" + content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{CSV_FILENAME}"'},
    )


__all__ = ["CSV_FILENAME", "router"]
