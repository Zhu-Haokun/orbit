"""Orbit / 人情星图 —— FastAPI 应用入口（规范 §6.2 / §40.2 / §45 / §57）。

职责很小，只有四件事：

1. 注册全部 ``/api`` 路由；
2. 配置 CORS（来源来自环境变量，允许携带凭据）；
3. 把 ``UPLOAD_DIR`` 挂到 ``/uploads``；
4. 兜住未处理的异常：日志里留完整 traceback，响应里只给一句温和的中文。

注意：**这里不会调用 ``create_all``**。建表只走两条路径——
``alembic upgrade head``（推荐）或 ``python -m app.seed``（本地 Demo，内部调用
``app.db.session.init_db``）。原因见 ``app/db/session.py`` 的模块说明。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import ROUTERS
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("orbit")

#: §40.2：技术错误只进日志，用户看到的是这一句。
GENERIC_ERROR_DETAIL = "暂时没能完成这次操作，请稍后再试。"

#: 前端构建产物（``npm run build`` → ``frontend/dist``）。
#: 存在的话就把整个应用挂在同一个端口上：运行时就**不需要 Node**，
#: 免去对方机器上的 ``npm install``。见 ``start-orbit.bat`` 的免 Node 路径。
DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _serve_built_frontend(target: FastAPI) -> None:
    """把 ``frontend/dist`` 挂到同一个应用上；没有构建产物就什么都不做。

    必须在 ``/uploads`` 挂载**之后**调用：Starlette 按注册顺序匹配路由，
    后注册的 catch-all 会抢走先注册的挂载点，上传的图片就会变成 index.html。

    前端的 API 基址是相对的 ``/api``，所以同源托管不需要任何额外配置。
    """
    if not DIST_DIR.is_dir():
        return

    assets = DIST_DIR / "assets"
    if assets.is_dir():
        target.mount("/assets", StaticFiles(directory=assets), name="assets")
    index = DIST_DIR / "index.html"
    if not index.is_file():
        return

    @target.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> Response:
        # 未知的 /api 与 /uploads 保持 404：不要静默回退成页面，
        # 否则前端会拿到一份 HTML 再去 JSON.parse，报错完全看不懂。
        if full_path.startswith(("api/", "uploads/")):
            return JSONResponse(status_code=404, content={"detail": "没有找到这个地址。"})
        candidate = DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        # 其余交给前端路由（React Router 的 history 模式）。
        return FileResponse(index)

    logger.info("已挂载前端构建产物：%s", DIST_DIR)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """启动时准备好上传目录并挂载 ``/uploads``。

    ``StaticFiles(check_dir=True)`` 在构造时就会校验目录，所以必须**先建目录再挂载**；
    磁盘只读时退回 ``check_dir=False``，应用依然能启动，只是上传会失败。
    """
    try:
        Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
        _app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
    except OSError as exc:  # pragma: no cover - 取决于部署环境
        logger.warning("上传目录不可用（%s）：%s", settings.upload_dir, exc)
        _app.mount(
            "/uploads",
            StaticFiles(directory=settings.upload_dir, check_dir=False),
            name="uploads",
        )
    # 必须在上面的 /uploads 之后：catch-all 会抢走先注册的挂载点。
    _serve_built_frontend(_app)
    yield


app = FastAPI(
    title="Orbit / 人情星图 API",
    description=(
        "私人关系记忆系统的后端：记录共同经历、近况、未完待续、重要日期、借还与偏好，"
        "让未来的自己重新找到这些上下文。它不是 CRM，也不对关系打分。"
    ),
    version="1.0.0",
    # 前端用 /api/people 这类路径，不希望通过 307 跳转。
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in ROUTERS:
    app.include_router(router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """未处理异常：日志留痕，响应不泄露任何内部信息（§40.2）。"""
    logger.exception("未处理的异常：%s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": GENERIC_ERROR_DETAIL})


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    """存活探针；也方便前端确认后端是否已经起来。"""
    return {"status": "ok"}


__all__ = ["GENERIC_ERROR_DETAIL", "app"]
