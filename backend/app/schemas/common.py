"""Schema 公共基础设施：camelCase 别名、UTC 时间、纯日期（规范 §59 / §77）。

这里刻意不依赖 ``pydantic.alias_generators``，自己实现 :func:`to_camel`，
这样契约转换规则完全掌握在本文件里。
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, PlainSerializer


def to_camel(field_name: str) -> str:
    """``last_interaction_at`` → ``lastInteractionAt``。"""
    head, *rest = field_name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in rest)


class CamelModel(BaseModel):
    """Base model: 出参 camelCase，入参 camelCase 与 snake_case 都接受。"""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


def _to_utc(value: Any) -> Any:
    """把朴素时间按 UTC 解释，把带时区的时间换算到 UTC。"""
    if value is None or isinstance(value, datetime):
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=UTC)
            return value.astimezone(UTC)
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=UTC)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        normalized = text[:-1] + "+00:00" if text.endswith(("Z", "z")) else text
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            try:
                parsed_date = date.fromisoformat(text[:10])
            except ValueError:
                return value
            return datetime(parsed_date.year, parsed_date.month, parsed_date.day, tzinfo=UTC)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    return value


def _serialize_utc(value: datetime) -> str:
    """输出 ISO-8601，并以 ``Z`` 结尾，保证前端拿到的瞬间没有歧义。"""
    value = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return value.isoformat().replace("+00:00", "Z")


#: 任何时间戳字段都用它：入参补 UTC，出参以 ``Z`` 结尾。
UtcDatetime = Annotated[
    datetime,
    BeforeValidator(_to_utc),
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]


def _to_plain_date(value: Any) -> Any:
    if value is None or isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return value
    return value


def _serialize_plain_date(value: date) -> str:
    return value.isoformat()


#: 全天事件（生日、借出日期…）序列化为 ``"YYYY-MM-DD"`` 纯字符串。
PlainDate = Annotated[
    date,
    BeforeValidator(_to_plain_date),
    PlainSerializer(_serialize_plain_date, return_type=str, when_used="json"),
]


#: 与前端 ``src/lib/validation.ts`` 里的 ``EMAIL_PATTERN`` 完全一致。
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _to_email(value: Any) -> Any:
    """邮箱地址（规范 §6.4）。

    这里刻意不使用 ``pydantic.EmailStr``：它底层的 ``email-validator`` 会把
    ``.local`` 判定为 special-use / 保留域名而直接拒绝，而规范 §6.4、§64 明确要求
    Demo 账号是 ``demo@orbit.local``。改用与前端同一套规则后，
    「同一份输入在前后端得到同一个结论」，也不会再出现 Demo 账号注册不出来的问题。
    """
    if value is None or not isinstance(value, str):
        return value
    text = value.strip().lower()
    if not text:
        raise ValueError("请输入邮箱")
    if len(text) > 254 or not EMAIL_PATTERN.match(text):
        raise ValueError("邮箱格式看起来不太对")
    return text


#: 邮箱字段统一用它。
EmailAddress = Annotated[str, BeforeValidator(_to_email)]
