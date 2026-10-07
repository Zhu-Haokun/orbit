"""版本与更新（``/api/version``）。

三条规则：

1. **不自动更新。** 只回答"有没有新版本"，下载由用户点。
2. **不替换正在运行的文件。** 下载只落到 ``update-staging/``，
   真正替换由 ``apply-update.bat`` 在程序关闭后执行。
3. **离线不是错误。** 检查失败只返回一条说明，不影响应用使用。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core import release
from app.schemas.common import CamelModel

router = APIRouter(prefix="/api", tags=["version"])


class VersionInfo(CamelModel):
    name: str
    current: str
    repository: str
    notes: str
    #: 更新包是否已经下载好、等待应用。
    staged: bool
    staged_files: int
    #: 服务端正在发的入口 chunk 文件名；前端拿它对比自己那一份，
    #: 不一致就说明页面是旧的，自动刷新一次。
    frontend_entry: str | None = None


class UpdateCheck(CamelModel):
    current: str
    repository: str
    latest: str | None
    latest_name: str | None
    release_notes: str | None
    release_url: str | None
    published_at: str | None
    has_update: bool
    can_download: bool
    #: 检查失败的原因；成功时为 None。离线时也是这里给一句话。
    error: str | None


class StagedResult(CamelModel):
    files: int
    bytes: int
    skipped: int
    path: str
    message: str


def _version_info() -> dict[str, Any]:
    info = release.read_release()
    staged = release.staged_status()
    return {
        "name": info.name,
        "current": info.version,
        "repository": info.repository,
        "notes": info.notes,
        "staged": bool(staged.get("ready")),
        "staged_files": int(staged.get("files") or 0),
        "frontend_entry": release.frontend_entry(),
    }


@router.get("/version", response_model=VersionInfo)
def read_version() -> dict[str, Any]:
    """当前版本。**不联网** —— 打开设置页就调它，必须瞬时。"""
    return _version_info()


@router.get("/version/check", response_model=UpdateCheck)
def check_update() -> dict[str, Any]:
    """问 GitHub 有没有新版本。离线或未配置仓库时 ``error`` 给原因。"""
    info = release.read_release()
    base: dict[str, Any] = {
        "current": info.version,
        "repository": info.repository,
        "latest": None,
        "latest_name": None,
        "release_notes": None,
        "release_url": None,
        "published_at": None,
        "has_update": False,
        "can_download": False,
        "error": None,
    }

    try:
        latest = release.fetch_latest(info.repository)
    except release.ReleaseError as exc:
        base["error"] = str(exc)
        return base

    base.update(
        {
            "latest": latest.version,
            "latest_name": latest.name,
            "release_notes": latest.notes,
            "release_url": latest.html_url,
            "published_at": latest.published_at,
            "has_update": release.is_newer(latest.version, info.version),
            "can_download": bool(latest.download_url),
        }
    )
    return base


@router.post("/version/download", response_model=StagedResult)
def download_update() -> dict[str, Any]:
    """把最新版本下载并解压到 ``update-staging/``。

    只暂存，不应用 —— 运行中的进程替换自己的源码会失败。
    """
    from fastapi import HTTPException, status

    info = release.read_release()
    try:
        latest = release.fetch_latest(info.repository)
        result = release.stage_update(latest.download_url or "")
    except release.ReleaseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        **result,
        "message": "更新已下载。请关闭所有 Orbit 窗口，再双击 update-staging 里的 apply-update.bat。",
    }


@router.delete("/version/download")
def cancel_update() -> dict[str, str]:
    """丢掉暂存的更新。

    返回一句 JSON 而不是 204：前端统一按 JSON 解析响应，空 body 会炸。
    """
    release.clear_staged()
    return {"message": "已取消，暂存的更新包已删除。"}


__all__ = ["router"]
