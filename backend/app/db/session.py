"""引擎、会话工厂与 ``init_db``（规范 §6.2 / §62）。

两条建库路径，README 与下方 docstring 都按同一口径说明：

1. **推荐路径（部署、PostgreSQL）**：``alembic upgrade head``。
   迁移文件 ``alembic/versions/0001_initial.py`` 建出全部表，
   应用启动前执行一次即可，``main.py`` 绝不会调用 ``create_all``。
2. **便捷路径（本地 Demo、SQLite）**：``python -m app.seed``。
   seed 脚本会先调用 :func:`init_db`（即 ``Base.metadata.create_all``）再灌演示数据，
   因此没有 alembic 也能直接体验。两条路径得到的表结构是一致的。
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# SQLite 需要 ``check_same_thread=False``，否则 FastAPI 的线程池会报错；
# PostgreSQL 则完全不需要 connect_args。
_connect_args: dict[str, Any] = {"check_same_thread": False} if settings.is_sqlite else {}

engine: Engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection: Any, connection_record: Any) -> None:
    """SQLite 默认不校验外键，打开它，保证删除级联与约束真实生效。"""
    if type(dbapi_connection).__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def init_db() -> None:
    """Create every table from the ORM metadata. Used by the seed script only.

    ``create_all`` 只建表、**不写 ``alembic_version``**。如果不补这一笔，
    用 ``start-orbit.bat`` 装出来的库在用户第一次更新时会失败：
    ``alembic upgrade head`` 从 ``0001_initial`` 开始跑，撞上已存在的表。
    所以建完表立刻标记到 head，让两条安装路径产出的库完全一致。
    """
    # Importing the models module registers all mappers on ``Base.metadata``.
    from app import models  # noqa: F401  (side-effect import)
    from app.db.base import Base

    Base.metadata.create_all(bind=engine)

    # 延迟导入：migrate 会反过来 import 本模块的 engine。
    from app.db.migrate import stamp_head

    stamp_head()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def session_scope() -> Iterator[Session]:
    """Context manager for scripts (seed, tests helpers)."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
