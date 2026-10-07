"""所有枚举（规范 §77：保持前后端 enum 一致）。

每个枚举都继承 ``str, Enum``，**值就是** ``frontend/src/types/index.ts``
里的小写字符串，因此可以直接跨 JSON 边界使用。
"""

from __future__ import annotations

from enum import Enum


class CircleLevel(str, Enum):
    """圈层：只是用户手动设置的关注层级，不是评分（规范 §20 / §56）。"""

    CORE = "core"
    FREQUENT = "frequent"
    NORMAL = "normal"
    OCCASIONAL = "occasional"


class CommitmentStatus(str, Enum):
    """未完待续状态（规范 §23）。"""

    OPEN = "open"
    DONE = "done"
    CANCELLED = "cancelled"
    LATER = "later"


class DatePrecision(str, Enum):
    """日期精度（规范 §24）：精确 / 只到月 / 季节 / 纯文本。"""

    EXACT = "exact"
    MONTH = "month"
    SEASON = "season"
    TEXT = "text"


class RepeatType(str, Enum):
    NONE = "none"
    YEARLY = "yearly"


class InteractionSource(str, Enum):
    MANUAL = "manual"
    AI_PARSED = "ai_parsed"


class UpdateStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class BorrowDirection(str, Enum):
    BORROWED_FROM = "borrowed_from"
    LENT_TO = "lent_to"


class BorrowStatus(str, Enum):
    OPEN = "open"
    RETURNED = "returned"
    CANCELLED = "cancelled"


class PreferenceCategory(str, Enum):
    LIKE = "like"
    DISLIKE = "dislike"
    INTEREST = "interest"
    WISH = "wish"
    FOOD = "food"
    OTHER = "other"


class AttachmentFileType(str, Enum):
    IMAGE = "image"
    FILE = "file"


class ParserKind(str, Enum):
    """解析器来源：真实 LLM 还是内置规则（规范 §31 / §32）。"""

    LLM = "llm"
    RULES = "rules"


#: 未完成的未完待续状态（“今天”页与派生字段都用这两个）。
OPEN_COMMITMENT_STATUSES = (CommitmentStatus.OPEN, CommitmentStatus.LATER)
