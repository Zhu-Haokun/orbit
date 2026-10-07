"""存储位置（``GET /api/storage``）。

回答一个私人记录工具最该回答的问题：**我的东西到底存在哪？**

只读，不做任何写操作。刻意**没有**提供"在运行时切换数据目录"的接口 ——
SQLite 在服务运行期间持有文件句柄，uploads 又是在启动时挂载的静态目录，
运行中挪动它们会直接损坏数据。切换目录应该由用户在 ``.env`` 里改，
然后重启，走一个能验证、能回退的流程。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.common import CamelModel

router = APIRouter(prefix="/api", tags=["storage"])


class StorageInfo(CamelModel):
    """当前数据落在哪个位置，以及各占多大。

    路径给两套：
    * ``*_display`` —— 从整个项目文件夹（例如 ``人情星图``）开始的相对路径。
      这是给人看的：把这个文件夹打包发给别人，路径依然是对的。
    * ``*_path`` —— 本机绝对路径。复制到资源管理器里才能用。
    """

    #: 后端进程的工作目录（绝对路径）。
    backend_dir: str
    #: 被当作"项目根"的那一层，通常就是打包发出去的那个文件夹。
    package_root: str
    package_root_name: str

    #: ``.env`` 里配置的原始值，方便用户照着改。
    database_url: str
    upload_dir_setting: str

    database_path: str
    database_display: str
    database_exists: bool
    database_bytes: int

    upload_path: str
    upload_display: str
    upload_exists: bool
    upload_bytes: int
    upload_file_count: int

    env_file: str
    env_file_display: str


def _dir_size(path: Path) -> tuple[int, int]:
    """返回 ``(文件数, 总字节)``；目录不存在时返回 ``(0, 0)``。"""
    if not path.is_dir():
        return 0, 0
    files = [item for item in path.rglob("*") if item.is_file()]
    return len(files), sum(item.stat().st_size for item in files)


def _sqlite_path(database_url: str, base: Path) -> Path | None:
    """从 ``sqlite:///./orbit.db`` 这样的串里取出真实文件路径。"""
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return None
    raw = database_url[len(prefix) :]
    candidate = Path(raw)
    return candidate if candidate.is_absolute() else (base / candidate).resolve()


def _package_root(backend_dir: Path) -> Path:
    """找到"打包发出去"的那一层文件夹。

    布局是 ``<项目根>/orbit/backend``，所以往上两级。
    如果布局不是这样（比如被单独部署），就退回到 ``orbit`` 这一层 ——
    宁可锚点浅一点，也不要把整条绝对路径暴露出去。
    """
    orbit_dir = backend_dir.parent
    parent = orbit_dir.parent
    return parent if parent != orbit_dir else orbit_dir


def _display(path: Path, root: Path) -> str:
    """相对项目根的展示路径；万一不在根下面，就退回文件名。"""
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


@router.get("/storage", response_model=StorageInfo)
def read_storage() -> dict[str, Any]:
    """当前存储位置。不包含任何记录内容，只有路径与体积。"""
    backend_dir = Path.cwd()
    root = _package_root(backend_dir)
    db_path = _sqlite_path(settings.database_url, backend_dir)
    upload_path = Path(settings.upload_dir)
    if not upload_path.is_absolute():
        upload_path = (backend_dir / upload_path).resolve()

    upload_count, upload_bytes = _dir_size(upload_path)
    db_exists = db_path is not None and db_path.is_file()
    env_file = backend_dir / ".env"

    return {
        "backend_dir": str(backend_dir),
        "package_root": str(root),
        "package_root_name": root.name,
        "database_url": settings.database_url,
        "upload_dir_setting": settings.upload_dir,
        "database_path": str(db_path) if db_path is not None else settings.database_url,
        "database_display": _display(db_path, root) if db_path is not None else settings.database_url,
        "database_exists": db_exists,
        "database_bytes": db_path.stat().st_size if db_exists and db_path is not None else 0,
        "upload_path": str(upload_path),
        "upload_display": _display(upload_path, root),
        "upload_exists": upload_path.is_dir(),
        "upload_bytes": upload_bytes,
        "upload_file_count": upload_count,
        "env_file": str(env_file),
        "env_file_display": _display(env_file, root),
    }


__all__ = ["router"]
