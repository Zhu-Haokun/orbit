"""上传路由（规范 §57）。

只允许 ``jpg / jpeg / png / webp``，单文件不超过 ``MAX_UPLOAD_MB``（默认 5MB）。
文件用 uuid 命名落在 ``UPLOAD_DIR``，由 ``main.py`` 以 ``/uploads`` 静态挂载对外提供。
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.core.config import settings
from app.core.deps import CurrentUser
from app.models.enums import AttachmentFileType
from app.schemas.common import CamelModel

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

#: 允许的扩展名 → MIME 类型（附件一律按图片处理，§57）。
ALLOWED_EXTENSIONS: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}

_BAD_TYPE = "只支持 jpg、jpeg、png、webp 这几种图片。"
_TOO_LARGE = "图片有点大，换一张小一点的试试。"
_EMPTY = "这个文件好像是空的，换一张图片试试。"


class UploadResult(CamelModel):
    """上传成功后返回可直接写进 ``attachmentUrls`` 的相对路径。"""

    url: str
    file_type: AttachmentFileType = AttachmentFileType.IMAGE


def _extension(filename: str) -> str:
    return Path(filename or "").suffix.lstrip(".").lower()


@router.post("", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload_image(
    current_user: CurrentUser,
    file: UploadFile = File(..., description="jpg / jpeg / png / webp"),
) -> UploadResult:
    """保存一张图片，返回 ``{url, fileType}``。"""
    extension = _extension(file.filename or "")
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_BAD_TYPE)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_EMPTY)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=_TOO_LARGE,
        )

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    (upload_dir / stored_name).write_bytes(content)

    return UploadResult(url=f"/uploads/{stored_name}", file_type=AttachmentFileType.IMAGE)


__all__ = ["ALLOWED_EXTENSIONS", "UploadResult", "router"]
