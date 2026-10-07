"""声明式基类、跨库 UUID 类型与通用列（规范 §44 / §86）。

这里只有两件“可移植性”的事：

* :class:`GUID` —— PostgreSQL 用原生 ``UUID``，其它数据库（SQLite）用 ``CHAR(36)``；
  Python 侧永远是 :class:`uuid.UUID`。
* :func:`enum_column` —— 所有枚举都存成字符串（``native_enum=False``），
  这样同一份模型在 SQLite 与 PostgreSQL 上行为一致，且值就是
  ``frontend/src/types/index.ts`` 里的小写字符串（规范 §77）。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    """Timezone-aware “now”，作为所有时间戳的默认值。"""
    return datetime.now(UTC)


class GUID(sa.types.TypeDecorator[uuid.UUID]):
    """Portable UUID column: native ``UUID`` on PostgreSQL, ``CHAR(36)`` elsewhere."""

    impl = sa.CHAR
    cache_ok = True

    def __init__(self, length: int = 36, **kwargs: Any) -> None:
        self.length = length
        super().__init__(length=length, **kwargs)

    def load_dialect_impl(self, dialect: sa.Dialect) -> sa.types.TypeEngine[Any]:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(sa.CHAR(self.length))

    def process_bind_param(self, value: Any, dialect: sa.Dialect) -> Any:
        if value is None:
            return None
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        return value if dialect.name == "postgresql" else str(value)

    def process_result_value(self, value: Any, dialect: sa.Dialect) -> uuid.UUID | None:
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


def uuid_pk() -> Mapped[uuid.UUID]:
    """标准主键列：``uuid.uuid4`` 生成，跨库一致。"""
    return mapped_column(GUID(), primary_key=True, default=uuid.uuid4)


def enum_column[E: Enum](enum_cls: type[E], *, default: E | None = None) -> sa.Enum:
    """字符串枚举列：与前端 enum 值逐字一致，SQLite / PostgreSQL 通用。"""
    return sa.Enum(
        enum_cls,
        native_enum=False,
        validate_strings=True,
        length=32,
        values_callable=lambda cls: [member.value for member in cls],
        default=default,
        name=enum_cls.__name__.lower(),
    )


class Base(DeclarativeBase):
    """Declarative base for every Orbit model."""

    type_annotation_map = {
        datetime: sa.DateTime(timezone=True),
        uuid.UUID: GUID(),
        dict[str, Any]: sa.JSON,
        list[str]: sa.JSON,
    }


class TimestampMixin:
    """``created_at`` / ``updated_at``（规范 §44 中大部分表都有）。"""

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
