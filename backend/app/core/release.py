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
import os
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


def _system_proxy() -> str | None:
    """读 Windows 系统代理，转成 httpx 能用的 URL。

    这一条是**必需的**，不是锦上添花：浏览器走的是系统代理（注册表里的
    ``Internet Settings``），而 Python 的 httpx 只认 ``HTTP_PROXY`` /
    ``HTTPS_PROXY`` 环境变量。两者不一致时就会出现最费解的现象 ——
    「我浏览器明明能打开 GitHub，应用却说连不上」。

    只在 Windows 上读注册表；其它平台交给 httpx 自己看环境变量。
    """
    if os.name != "nt":
        return None

    try:
        import winreg

        path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
            enabled, _ = winreg.QueryValueEx(key, "ProxyEnable")
            if not enabled:
                return None
            server, _ = winreg.QueryValueEx(key, "ProxyServer")
    except (OSError, ImportError):
        return None

    server = str(server or "").strip()
    if not server:
        return None

    # 两种写法都要认：
    #   "127.0.0.1:7890"
    #   "http=127.0.0.1:7890;https=127.0.0.1:7891"
    if "=" in server:
        parts: dict[str, str] = {}
        for chunk in server.split(";"):
            name, _, value = chunk.partition("=")
            if value:
                parts[name.strip().lower()] = value.strip()
        server = parts.get("https") or parts.get("http") or ""
        if not server:
            return None

    # 已经带 scheme 的不要动 —— 尤其别给 socks5:// 前面再糊一个 http://，
    # 那样拼出来的地址根本连不上。
    if "://" in server:
        if server.startswith(("http://", "https://")):
            return server
        if server.startswith(("socks4://", "socks5://", "socks://")):
            # httpx 走 SOCKS 需要额外装 socksio。没装就放弃代理退回直连，
            # 比传一个必然报错的地址好。
            try:
                import socksio  # noqa: F401
            except ImportError:
                return None
            return server
        return None
    return f"http://{server}"


def _get(url: str, headers: dict[str, str], *, follow_redirects: bool = True) -> httpx.Response:
    """GET 一次；系统代理连不上就退回直连。

    为什么需要这个兜底：系统代理可能**开着但没在跑**（Clash 关掉了，
    注册表里的 127.0.0.1:7890 还留着）。那样所有请求都会失败，用户明明
    能上网却收不到更新。直连再试一次往往就通了 —— 不是每个网络都封 GitHub。

    只在**连接层失败**时重试。代理返回了 4xx/5xx 说明它本身是通的，
    这时直连没有意义，直接把响应交给调用方判断。
    """
    proxy = _system_proxy()
    attempts: list[str | None] = [proxy, None] if proxy else [None]

    last_error: httpx.HTTPError | None = None
    for hop in attempts:
        try:
            if hop:
                with httpx.Client(
                    timeout=CHECK_TIMEOUT_SECONDS, follow_redirects=follow_redirects, proxy=hop
                ) as client:
                    return client.get(url, headers=headers)
            with httpx.Client(
                timeout=CHECK_TIMEOUT_SECONDS, follow_redirects=follow_redirects, trust_env=bool(proxy)
            ) as client:
                return client.get(url, headers=headers)
        except httpx.ConnectError as exc:
            # 连不上 —— 可能是代理没开，换直连再试。
            last_error = exc
        except httpx.HTTPError:
            # 连上了但请求本身出问题（超时、TLS…），换路径也不会有改善。
            raise

    raise ReleaseError(f"连不上 GitHub：{last_error.__class__.__name__ if last_error else '未知原因'}")


def _client(timeout: float, *, follow_redirects: bool = True) -> httpx.Client:
    """统一构造 httpx 客户端，带上系统代理。

    ``trust_env=True`` 保留 env 变量那条路（在 Linux/macOS 或用户显式设置
    HTTPS_PROXY 时有用）；系统代理存在时显式传参，优先级更高。
    """
    proxy = _system_proxy()
    if proxy:
        return httpx.Client(timeout=timeout, follow_redirects=follow_redirects, proxy=proxy)
    return httpx.Client(timeout=timeout, follow_redirects=follow_redirects, trust_env=True)

#: 更新包里允许出现的路径前缀。别的文件一律忽略，避免把用户的#: 数据或环境覆盖掉（防御性：即使发布的 ZIP 打包错了也不会出事）。
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

#: 完整安装包的文件名特征。一个 Release 上可能同时挂更新包和完整安装包
#: （前者约 0.7 MB，后者约 17 MB，含 105 MB 的依赖）。自动更新必须挑前者。
FULL_PACKAGE_MARKERS: tuple[str, ...] = (
    "完整安装包",
    "完整包",
    "full",
    "installer",
    "setup",
    "handoff",
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
    """挑下载地址：优先「名字里带 orbit 的更新包」，否则任何 zip。

    同一个 Release 上可能挂两个附件：

    * ``orbit-1.0.7.zip``              更新包，约 0.7 MB，给已有用户
    * ``orbit-1.0.7-完整安装包.zip``    完整包，约 17 MB，给新用户第一次装

    GitHub 返回的顺序不保证，所以必须**显式排掉完整安装包** —— 否则老用户
    会平白下载 17 MB（功能正常，但毫无必要，而且慢）。万一整个 Release 只有
    完整包，那也只能将就，总比没有更新可用好。
    """
    zips = [a for a in assets if str(a.get("name", "")).lower().endswith(".zip")]
    if not zips:
        return None

    def is_full_package(asset: dict[str, Any]) -> bool:
        name = str(asset.get("name", "")).lower()
        return any(marker in name for marker in FULL_PACKAGE_MARKERS)

    update_packages = [a for a in zips if not is_full_package(a)]
    pool = update_packages or zips
    preferred = [a for a in pool if "orbit" in str(a.get("name", "")).lower()]
    chosen = (preferred or pool)[0]
    url = chosen.get("browser_download_url")
    return str(url) if url else None


def fetch_latest(repository: str) -> LatestRelease:
    """问 GitHub 要最新的 release。任何失败都抛 :class:`ReleaseError`。

    先用 REST API（能拿到说明和附件列表）。被限流时降级走网页 ——
    匿名 API 每小时只有 60 次，用户如果在公司网络或共享出口 IP 后面，
    很容易撞上限额；那时更新功能不该静默失效。
    """
    if not repository:
        raise ReleaseError("还没有配置 GitHub 仓库地址，暂时无法检查更新。")

    url = f"{GITHUB_API}/repos/{repository}/releases/latest"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "orbit-update-check"}

    try:
        response = _get(url, headers)
    except httpx.HTTPError as exc:
        raise ReleaseError(f"连不上 GitHub：{exc.__class__.__name__}") from exc

    if response.status_code == 404:
        raise ReleaseError("仓库或 Release 不存在 —— 检查 release.json 里的 repository。")
    if response.status_code == 403:
        # 限流。网页路径不消耗 API 额度，能拿到版本号和附件下载地址，
        # 只是没有 release 说明 —— 有总比"更新功能不可用"好。
        return _fetch_latest_via_html(repository)
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


def _fetch_latest_via_html(repository: str) -> LatestRelease:
    """降级路径：不调用 REST API，因此不受 60 次/小时的额度限制。

    两步，都是普通网页请求：

    1. ``/releases/latest`` 会 302 到 ``/releases/tag/<tag>``，从 Location 里读出 tag
    2. ``/releases/expanded_assets/<tag>`` 返回一段列出附件的 HTML，从中找 zip

    拿不到 release 说明（那只有 API 有），但"有新版本 + 能下载"这两件事成立。
    """
    base = f"https://github.com/{repository}"
    headers = {"User-Agent": "orbit-update-check"}

    try:
        redirect = _get(f"{base}/releases/latest", headers, follow_redirects=False)
        location = redirect.headers.get("location", "")
        match = re.search(r"/releases/tag/([^/?#]+)", location)
        if not match:
            raise ReleaseError("GitHub 限流了，而且网页降级也没读到版本号，过一会儿再试。")
        tag = match.group(1)

        assets = _get(f"{base}/releases/expanded_assets/{tag}", headers)
    except httpx.HTTPError as exc:
        raise ReleaseError(f"连不上 GitHub：{exc.__class__.__name__}") from exc

    download_url = None
    if assets.status_code < 400:
        found = re.findall(r'href="([^"]*/releases/download/[^"]+\.zip)"', assets.text)
        if found:
            download_url = f"https://github.com{found[0]}" if found[0].startswith("/") else found[0]

    return LatestRelease(
        version=tag.lstrip("vV"),
        tag=tag,
        name=tag,
        notes="（GitHub 接口暂时限流，这次只取到了版本号，更新说明请到 Release 页面查看。）",
        html_url=f"{base}/releases/tag/{tag}",
        download_url=download_url,
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

    # 上一次下载可能失败到一半，留下一个空的 files\。先清干净再解压，
    # 否则下一次成功时会和残留混在一起，也难以判断 READY 是否可信。
    import shutil

    shutil.rmtree(STAGING_DIR, ignore_errors=True)

    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    archive = STAGING_DIR / "orbit-update.zip"

    try:
        with (
            _client(DOWNLOAD_TIMEOUT_SECONDS) as client,
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


# --------------------------------------------------------------------------- #
# 前端构建标识
# --------------------------------------------------------------------------- #

DIST_INDEX = REPO_ROOT / "frontend" / "dist" / "index.html"


def frontend_entry() -> str | None:
    """当前要发给浏览器的入口 chunk 文件名，例如 ``/assets/index-a1b2c3.js``。

    Vite 给每个 chunk 的文件名里都嵌了内容哈希，所以这个值**只要前端重新构建过就会变**。

    用途：页面开着不动的时候，后端可能已经换成新的一份前端了（用户刚更新完，
    或者开发时重新构建）。浏览器里那份 React 应用还是旧的，而
    ``start-orbit.bat`` 打开同一个地址时，已开着的标签页只会被切到前台、
    **不会重新加载** —— 用户看到的就是一份陈旧界面，还以为更新没生效。

    前端拿自己入口的文件名和这个值比一下，不一致就刷新一次。
    """
    try:
        html = DIST_INDEX.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    match = re.search(r'src="(/assets/[^"]+\.js)"', html)
    return match.group(1) if match else None


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
    "frontend_entry",
    "SAFE_PREFIXES",
    "FORBIDDEN_NAMES",
]
