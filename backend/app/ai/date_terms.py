"""中文日期表达与共用正则（规范 §24 / §32 / §46）。

规则解析器与 LLM 解析器共用这里的“相对日期”解析：
用户写“下个月”“11 月 12 日”“寒假”，我们要能落到
``date`` + ``date_text`` + ``date_precision`` 三个字段上，且**绝不编造**具体日期。
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from app.models.enums import DatePrecision

#: 子句切分：中英文标点与换行（规范 §45 示例里的逗号、句号都要切开）。
CLAUSE_SPLIT_RE = re.compile(r"[，。；、！？,;!?\n]+")

#: 日期表达（顺序即优先级：越具体的越靠前）。
DATE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("iso", re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")),
    ("ymd", re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})?\s*[日号]?")),
    ("md", re.compile(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]")),
    ("month", re.compile(r"(\d{1,2})\s*月")),
    (
        "relative",
        re.compile(
            r"(今天|明天|后天|昨天|前天|下周[一二三四五六日天]?|下个?星期[一二三四五六日天]?|下个月|下月|这个月|本月|月底|月末|这周末|下周末|周末)"
        ),
    ),
    ("season", re.compile(r"(寒假|暑假|春天|夏天|秋天|冬天|春季|夏季|秋季|冬季)")),
)

#: 事件名词：只有出现这些词，日期才被当成“重要日期”（§24）。
EVENT_NOUNS: tuple[str, ...] = (
    "比赛",
    "考试",
    "答辩",
    "面试",
    "婚礼",
    "演出",
    "路演",
    "生日",
    "入职",
    "体检",
    "会议",
    "组会",
    "活动",
    "外拍",
    "旅行",
)

#: 生日单独处理：默认每年重复。
BIRTHDAY_TERMS: tuple[str, ...] = ("生日", "寿辰", "诞辰")

#: 借还方向。
BORROW_LEND_RE = re.compile(r"借给|借了给|借出")
BORROW_TAKE_RE = re.compile(r"借走|借了|借用|借来|向.{0,6}借")

#: 借还句里“谁把什么借给谁”的部分，用来抽出物品名。
BORROW_ITEM_RE = re.compile(r".*?借(给|走|了|出|来|用)?")

#: 日期前后的连接词，从标题里剔除时一起去掉。
DATE_GLUE_RE = re.compile(r"^(在|于|是|的)+")

_WEEKDAY_OFFSET = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}

#: 这些相对表达只知道“哪个月”，精度是 month 而不是 exact（规范 §24）。
_MONTH_ONLY_WORDS = {"下个月", "下月", "这个月", "本月"}


def _shift_months(base: date, months: int) -> tuple[int, int]:
    total = base.year * 12 + (base.month - 1) + months
    return total // 12, total % 12 + 1


def resolve_date_text(text: str, reference: date) -> str | None:
    """把相对日期表达解析成 ``YYYY-MM-DD``；无法确定就返回 ``None``（不编造）。"""
    if text in {"今天", "本日"}:
        return reference.isoformat()
    if text == "明天":
        return (reference + timedelta(days=1)).isoformat()
    if text == "后天":
        return (reference + timedelta(days=2)).isoformat()
    if text == "昨天":
        return (reference - timedelta(days=1)).isoformat()
    if text in {"前天"}:
        return (reference - timedelta(days=2)).isoformat()

    if text.startswith("下周") or text.startswith("下星期"):
        tail = text[-1]
        offset = _WEEKDAY_OFFSET.get(tail)
        days_ahead = (7 - reference.weekday()) + (offset if offset is not None else 0)
        return (reference + timedelta(days=days_ahead)).isoformat()

    if text in {"下个月", "下月"}:
        year, month = _shift_months(reference, 1)
        return date(year, month, 1).isoformat()
    if text in {"这个月", "本月"}:
        return date(reference.year, reference.month, 1).isoformat()
    if text in {"月底", "月末"}:
        year, month = _shift_months(reference, 1)
        return (date(year, month, 1) - timedelta(days=1)).isoformat()

    if text.endswith("周末"):
        days_ahead = (5 - reference.weekday()) % 7
        if text.startswith("下"):
            days_ahead += 7
        return (reference + timedelta(days=days_ahead)).isoformat()

    return None


def first_date_expression(text: str) -> tuple[str, DatePrecision, str | None] | None:
    """返回 ``(原文, 精度, 解析出的日期或 None)``，按具体程度优先。"""
    for kind, pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match is None:
            continue
        raw = match.group(0)
        return raw, _precision_for(kind, raw), _value_for(kind, match)
    return None


def _precision_for(kind: str, raw: str = "") -> DatePrecision:
    if kind == "month":
        return DatePrecision.MONTH
    if kind == "season":
        return DatePrecision.SEASON
    # “下个月 / 这个月”这种相对表达只知道月份，精度是 month（规范 §24 / §70 步骤 9）。
    if kind == "relative" and raw in _MONTH_ONLY_WORDS:
        return DatePrecision.MONTH
    return DatePrecision.EXACT


def _value_for(kind: str, match: re.Match[str]) -> str | None:
    if kind == "iso":
        year, month, day = (int(part) for part in match.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None
    if kind == "ymd":
        year, month, day = match.groups()
        year_i, month_i = int(year), int(month)
        if not day:
            try:
                return date(year_i, month_i, 1).isoformat()
            except ValueError:
                return None
        try:
            return date(year_i, month_i, int(day)).isoformat()
        except ValueError:
            return None
    if kind == "md":
        month, day = (int(part) for part in match.groups())
        try:
            return date(date.today().year, month, day).isoformat()
        except ValueError:
            return None
    if kind == "month":
        month = int(match.group(1))
        if 1 <= month <= 12:
            return date(date.today().year, month, 1).isoformat()
        return None
    return None


def parse_date_expression(text: str, reference: date) -> tuple[str, DatePrecision, str | None] | None:
    """同上，但会把无年份的“11 月 12 日”落到 ``reference`` 所在的年份。"""
    found = first_date_expression(text)
    if found is None:
        return None
    raw, precision, value = found
    if value is not None:
        return raw, precision, value

    year_match = re.match(r"(\d{4})", raw)
    if year_match:
        return raw, precision, value

    filled = resolve_date_text(raw, reference)
    if filled is not None:
        return raw, precision, filled

    month_day = re.fullmatch(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]", raw)
    if month_day:
        month, day = int(month_day.group(1)), int(month_day.group(2))
        try:
            return raw, DatePrecision.EXACT, date(reference.year, month, day).isoformat()
        except ValueError:
            return raw, precision, None

    month_only = re.fullmatch(r"(\d{1,2})\s*月", raw)
    if month_only:
        month = int(month_only.group(1))
        if 1 <= month <= 12:
            return raw, DatePrecision.MONTH, date(reference.year, month, 1).isoformat()

    return raw, precision, None


def detect_event_noun(text: str) -> str | None:
    """返回文本里第一个事件名词（用于判断“这算不算重要日期”）。"""
    for noun in EVENT_NOUNS:
        if noun in text:
            return noun
    return None


def is_birthday(text: str) -> bool:
    return any(term in text for term in BIRTHDAY_TERMS)


__all__ = [
    "BIRTHDAY_TERMS",
    "BORROW_ITEM_RE",
    "BORROW_LEND_RE",
    "BORROW_TAKE_RE",
    "CLAUSE_SPLIT_RE",
    "DATE_GLUE_RE",
    "DATE_PATTERNS",
    "EVENT_NOUNS",
    "detect_event_noun",
    "first_date_expression",
    "is_birthday",
    "parse_date_expression",
    "resolve_date_text",
]
