"""把数据库升到最新 schema —— 并且能处理"用 seed 装出来的库"。

## 为什么需要这个模块

Orbit 有两条建库路径：

* ``alembic upgrade head`` —— 部署、PostgreSQL 用
* ``python -m app.seed`` —— 本地一键启动用，内部是 ``Base.metadata.create_all``

两者建出的**表结构一样**，但 ``create_all`` **不会写 ``alembic_version``**。
于是通过 ``start-orbit.bat`` 安装的用户，库里明明有表，alembic 却认为它是空的 ——
第一次更新时 ``upgrade head`` 会从 ``0001_initial`` 开始跑，撞上已存在的表而失败。

这个模块负责把这种情况补上标记，再执行升级。

**判据**：库里有业务表，但没有 ``alembic_version`` → 说明是 ``create_all`` 建的，
按当时的 schema 版本补一个标记，然后才允许继续升级。
"""

from __future__ import annotations

import logging
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext

from app.db.session import engine

logger = logging.getLogger("orbit.migrate")

#: ``backend/alembic.ini``。``__file__`` 在 backend/app/db/ 下，往上三层。
BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

#: 判断"这不是一个空库"用的表。出现任意一张就说明 create_all 已经跑过。
BUSINESS_TABLES = ("users", "people", "interactions")


def _alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    # alembic.ini 里的 script_location 是相对路径，alembic 按**当前工作目录**
    # 解析它 —— 从别处调用（测试、脚本）就会报 "Path doesn't exist: alembic"。
    # 这里钉成绝对路径，谁调用都一样。
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # 让 alembic 用应用自己的连接串，避免 .env 与 ini 不一致。
    from app.core.config import settings

    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def current_revision() -> str | None:
    """库里记录的 alembic 版本；没标记时返回 ``None``。"""
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def _has_business_tables() -> bool:
    inspector = sa.inspect(engine)
    existing = set(inspector.get_table_names())
    return any(name in existing for name in BUSINESS_TABLES)


def stamp_head() -> None:
    """把库标记到最新版本，但**不执行任何迁移**。

    ``app.seed`` 建完表之后会调用它，让"seed 装的库"和"alembic 装的库"
    在版本表上一致 —— 否则用户第一次更新必定失败。
    """
    command.stamp(_alembic_config(), "head")
    logger.info("已把数据库标记到 alembic head")


def upgrade_to_head() -> str:
    """升级到最新 schema，返回一句结果说明。

    * 空库 → 正常跑全部迁移
    * 已标记的库 → 只跑缺的那几个
    * ``create_all`` 建的、没标记的库 → 先补标记，再跑
    """
    revision = current_revision()
    if revision is not None:
        command.upgrade(_alembic_config(), "head")
        return f"已从 {revision} 升级到最新。"

    if _has_business_tables():
        # create_all 建的库：表已经是最新的，只是缺标记。
        command.stamp(_alembic_config(), "head")
        return "检测到用 seed 安装的数据库，已补上版本标记（表结构无需改动）。"

    command.upgrade(_alembic_config(), "head")
    return "已在新数据库中执行全部迁移。"


def main() -> int:
    """``python -m app.db.migrate`` —— 给 apply-update.bat 用。"""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        message = upgrade_to_head()
    except Exception as exc:  # noqa: BLE001 - 命令行工具，要把原因说清楚
        logger.error("数据库升级失败：%s", exc)
        return 1
    logger.info("数据库已就绪：%s", message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
