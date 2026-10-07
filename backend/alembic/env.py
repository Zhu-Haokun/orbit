"""Alembic 运行环境（规范 §6.2 / §62）。

要点：

* 数据库地址只来自 ``app.core.config.settings.database_url``（即 ``DATABASE_URL``），
  ``alembic.ini`` 里不重复写一份，避免两处配置漂移；
* ``target_metadata`` 指向 :class:`app.db.base.Base`，方便以后 ``--autogenerate``；
* SQLite 需要 ``render_as_batch=True``，否则以后改列会失败。
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# 导入所有模型，让 Base.metadata 拿到全部表。
from app import models  # noqa: F401
from app.core.config import settings
from app.db.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """``alembic upgrade head --sql``：只生成 SQL，不连库。"""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=settings.is_sqlite,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """正常迁移：连库执行。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=settings.is_sqlite,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
