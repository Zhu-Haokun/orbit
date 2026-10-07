"""发布信息与更新检查。

Orbit 是本地软件：代码可以更新，数据永远留在使用者的机器上。
这个模块只负责前一半 —— 回答"有没有新版本"，以及把新版本下载下来。

**它不负责替换文件。** 运行中的进程替换自己的源码会失败或损坏，
所以真正落地由 ``apply-update.bat`` 在程序关闭之后做，那份脚本
按白名单复制，并且绝不动 ``orbit.db`` / ``uploads``。

网络不可用时一律安静降级：更新是便利功能，不该让应用启动不了。
"""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

#: 仓库根目录（``<repo>/release.json``）。__file__ 在 backend/app/core/ 下，往上四层。
REPO_ROOT = Path(__file__).resolve().parents[3]
RELEASE_FILE = REPO_ROOT / "release.json"
#: 下载下来的新版本先放这里，等用户关掉程序再应用。
STAGING_DIR = REPO_ROOT / "update-staging"

GITHUB_API = "https://api.github.com"

#: 一次更新检查最多等多久 —— 离线时不能让设置页转圈。
CHECK_TIMEOUT_SECONDS = 8.0
#: 下载安装包通常更大，给宽一点。
DOWNLOAD_TIMEOUT_SECONDS = 120.0

#: 更新包里允许出现的路径前缀。别的文件一律忽略，避免把用户的
#: 数据或环境覆盖掉（防御性：即使发布的 ZIP 打包错了也不会出事）。
SAFE_PREFIXES: tuple[str, ...] = (
    "backend/app/",
    "backend/alembic/",
    "backend/alembic.ini",
    "backend/requirements",
    "backend/pyproject.toml",
    "backend/smoke_test.py",
    "backend/tests/",
    "frontend/dist/",
    "frontend/src/",
    "frontend/public/",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",
    "frontend/vitest.config.ts",
    "frontend/eslint.config.js",
    "frontend/index.html",
    "start-orbit.bat",
    "apply-update.bat",
    "docker-compose.yml",
    "README.md",
    "release.json",
)

#: 这些东西**永远**不能出现在更新内容里，命中就整个包作废。
FORBIDDEN_NAMES: tuple[str, ...] = (
    "orbit.db",
    "orbit.db-journal",
    "orbit.db-wal",
)


class ReleaseError(RuntimeError):
    """更新检查或下载失败；消息可以直接给用户看。"""


@dataclass(slots=True)
class ReleaseInfo:
    """当前这一份代码的发布信息。"""

    name: str
    version: str
    repository: str
    notes: str = ""


@dataclass(slots=True)
class LatestRelease:
    """GitHub 上最新的那个 release。"""

    version: str
    tag: str
    name: str
    notes: str
    html_url: str
    download_url: str | None = None
    published_at: str | None = None
    errors: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# 当前版本
# --------------------------------------------------------------------------- #


def read_release() -> ReleaseInfo:
    """读 ``release.json``；文件缺失或损坏时给一个能看的默认值。"""
    try:
        raw: dict[str, Any] = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ReleaseInfo(name="Orbit / 人情星图", version="0.0.0", repository="")

    return ReleaseInfo(
        name=str(raw.get("name") or "Orbit / 人情星图"),
        version=str(raw.get("version") or "0.0.0"),
        repository=str(raw.get("repository") or "").strip().strip("/"),
        notes=str(raw.get("notes") or ""),
    )


def _version_key(value: str) -> tuple[int, ...]:
    """``v1.2.3`` / ``1.2.3`` → ``(1, 2, 3)``；非数字段忽略。

    不用 ``packaging``：这只是比较两个版本号，不值得为它多一个依赖。
    """
    numbers = re.findall(r"\d+", value or "")
    return tuple(int(n) for n in numbers[:4]) or (0,)


def is_newer(candidate: str, current: str) -> bool:
    """``candidate`` 是否比 ``current`` 新。"""
    return _version_key(candidate) > _version_key(current)


# --------------------------------------------------------------------------- #
# 检查更新
# --------------------------------------------------------------------------- #


def _pick_zip_asset(assets: list[dict[str, Any]]) -> str | None:
    """挑下载地址：优先名字里带 orbit 的 zip，否则第一个 zip。"""
    zips = [a for a in assets if str(a.get("name", "")).lower().endswith(".zip")]
    if not zips:
        return None
    preferred = [a for a in zips if "orbit" in str(a.get("name", "")).lower()]
    chosen = (preferred or zips)[0]
    url = chosen.get("browser_download_url")
    return str(url) if url else None


def fetch_latest(repository: str) -> LatestRelease:
    """问 GitHub 要最新的 release。任何失败都抛 :class:`ReleaseError`。"""
    if not repository:
        raise ReleaseError("还没有配置 GitHub 仓库地址，暂时无法检查更新。")

    url = f"{GITHUB_API}/repos/{repository}/releases/latest"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "orbit-update-check"}

    try:
        with httpx.Client(timeout=CHECK_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise ReleaseError(f"连不上 GitHub：{exc.__class__.__name__}") from exc

    if response.status_code == 404:
        raise ReleaseError("仓库或 Release 不存在 —— 检查 release.json 里的 repository。")
    if response.status_code == 403:
        raise ReleaseError("GitHub 限流了，过一会儿再试。")
    if response.status_code >= 400:
        raise ReleaseError(f"GitHub 返回 {response.status_code}。")

    payload = response.json()
    tag = str(payload.get("tag_name") or "")
    return LatestRelease(
        # tag 常见写法是 v1.2.3，比较版本时去掉 v。
        version=tag.lstrip("vV") or str(payload.get("name") or "0.0.0"),
        tag=tag,
        name=str(payload.get("name") or tag),
        notes=str(payload.get("body") or ""),
        html_url=str(payload.get("html_url") or ""),
        download_url=_pick_zip_asset(list(payload.get("assets") or [])),
        published_at=payload.get("published_at"),
    )


# --------------------------------------------------------------------------- #
# 下载与暂存
# --------------------------------------------------------------------------- #


def _is_safe(member: str) -> bool:
    """成员是否允许落盘：必须在白名单前缀内，且不是数据文件。"""
    normalized = member.replace("\\", "/").lstrip("./")
    name = normalized.rsplit("/", 1)[-1]
    if name in FORBIDDEN_NAMES:
        return False
    # 更新包通常会把内容套一层顶层目录（orbit-1.2.0/...），先剥掉。
    parts = normalized.split("/")
    candidates = [normalized]
    if len(parts) > 1:
        candidates.append("/".join(parts[1:]))
    return any(c.startswith(SAFE_PREFIXES) for c in candidates)


def _strip_prefix(member: str) -> str:
    """去掉更新包可能自带的那一层顶层目录。"""
    normalized = member.replace("\\", "/").lstrip("./")
    parts = normalized.split("/")
    if len(parts) > 1 and not any(normalized.startswith(p) for p in SAFE_PREFIXES):
        return "/".join(parts[1:])
    return normalized


def stage_update(download_url: str) -> dict[str, Any]:
    """下载更新包并解压到 ``update-staging/``。

    只解压白名单内的文件；遇到数据文件直接判定整个包不可信。
    返回 ``{"files": n, "bytes": n, "skipped": n, "path": ...}``。
    """
    if not download_url:
        raise ReleaseError("这个 release 没有提供 zip 附件。")

    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    archive = STAGING_DIR / "orbit-update.zip"

    try:
        with (
            httpx.Client(timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True) as client,
            client.stream("GET", download_url) as response,
        ):
            if response.status_code >= 400:
                raise ReleaseError(f"下载失败，GitHub 返回 {response.status_code}。")
            with archive.open("wb") as handle:
                for chunk in response.iter_bytes(chunk_size=65536):
                    handle.write(chunk)
    except httpx.HTTPError as exc:
        raise ReleaseError(f"下载失败：{exc.__class__.__name__}") from exc

    written = 0
    total_bytes = 0
    skipped = 0
    try:
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                if member.is_dir():
                    continue
                raw_name = member.filename
                if Path(raw_name).name in FORBIDDEN_NAMES:
                    raise ReleaseError("更新包里含有数据库文件，已中止 —— 这不应该发生。")
                if not _is_safe(raw_name):
                    skipped += 1
                    continue
                target = STAGING_DIR / "files" / _strip_prefix(raw_name)
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(member) as source, target.open("wb") as sink:
                    sink.write(source.read())
                written += 1
                total_bytes += member.file_size
    except zipfile.BadZipFile as exc:
        raise ReleaseError("下载到的文件不是有效的 zip，可能没下完。") from exc
    finally:
        archive.unlink(missing_ok=True)

    if written == 0:
        raise ReleaseError("更新包里没有任何可用的文件。")

    (STAGING_DIR / "READY").write_text(
        f"files={written}\nbytes={total_bytes}\nskipped={skipped}\n",
        encoding="utf-8",
    )
    return {
        "files": written,
        "bytes": total_bytes,
        "skipped": skipped,
        "path": str(STAGING_DIR / "files"),
    }


def staged_status() -> dict[str, Any]:
    """``update-staging/`` 里是否已经有一份下载好的更新。"""
    marker = STAGING_DIR / "READY"
    if not marker.is_file():
        return {"ready": False}
    detail: dict[str, str] = {}
    try:
        for line in marker.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            detail[key.strip()] = value.strip()
    except OSError:
        return {"ready": False}
    return {
        "ready": True,
        "files": int(detail.get("files") or 0),
        "bytes": int(detail.get("bytes") or 0),
        "path": str(STAGING_DIR / "files"),
    }


def clear_staged() -> None:
    """丢掉暂存的更新（用户取消，或者应用完成后清理）。"""
    import shutil

    shutil.rmtree(STAGING_DIR, ignore_errors=True)


__all__ = [
    "REPO_ROOT",
    "ReleaseError",
    "ReleaseInfo",
    "LatestRelease",
    "read_release",
    "is_newer",
    "fetch_latest",
    "stage_update",
    "staged_status",
    "clear_staged",
    "SAFE_PREFIXES",
    "FORBIDDEN_NAMES",
]
