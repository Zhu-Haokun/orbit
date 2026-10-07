"""内置规则解析器（规范 §32 / §45 示例 / §70 步骤 8）。

没有 LLM key 时，项目仍然必须能完整演示，所以这里用一套克制的规则：

1. 按 ``，。；、！？,;!?\n`` 切子句；
2. 每个子句按优先级分类：
   承诺（我答应/答应/承诺/记得/回头/下次）
   > 重要日期（含日期表达 + 事件名词）
   > 近况（说/提到/最近/打算/准备/想/在）
   > 忽略；
3. 去掉开场词（今天、他说、我答应、和林夕…），把日期表达从标题里剔掉；
4. 输出与 LLM 完全相同的形状，前端不需要区分来源。

它只整理用户明确写下的内容，绝不推断性格、关系或敏感属性（§46）。
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.ai import date_terms
from app.models.enums import BorrowDirection, DatePrecision, PreferenceCategory, RepeatType
from app.schemas.ai import (
    ParsedBorrow,
    ParsedCommitment,
    ParsedImportantDate,
    ParsedInteraction,
    ParsedPreference,
    ParsedUpdate,
    ParseResult,
    PersonCandidate,
)

#: 承诺关键词（§32 “我答应”）。
COMMITMENT_MARKERS: tuple[str, ...] = ("我答应", "答应", "承诺", "记得", "回头", "下次")

#: 近况关键词。
UPDATE_MARKERS: tuple[str, ...] = ("说", "提到", "最近", "打算", "准备", "想", "在")

#: 偏好关键词 → 归类（§23）。「喜欢」和「不喜欢」要分开判断，所以顺序有意义。
PREFERENCE_MARKERS: tuple[tuple[str, PreferenceCategory], ...] = (
    ("不喜欢", PreferenceCategory.DISLIKE),
    ("讨厌", PreferenceCategory.DISLIKE),
    ("最爱", PreferenceCategory.LIKE),
    ("喜欢", PreferenceCategory.LIKE),
    ("爱吃", PreferenceCategory.FOOD),
    ("爱喝", PreferenceCategory.FOOD),
    ("常去", PreferenceCategory.INTEREST),
    ("习惯", PreferenceCategory.INTEREST),
    ("想要", PreferenceCategory.WISH),
    ("想去", PreferenceCategory.WISH),
)

#: 动作 → 互动标题。命中就用统一叫法，避免出现半截句子。
ACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"喝(了)?咖啡|咖啡"), "一起喝咖啡"),
    (re.compile(r"吃(了)?火锅|火锅"), "一起吃火锅"),
    (re.compile(r"吃(了)?烤肉|烤肉"), "一起吃烤肉"),
    (re.compile(r"吃(了)?饭|吃饭"), "一起吃饭"),
    (re.compile(r"喝(了)?茶|喝茶"), "一起喝茶"),
    (re.compile(r"聊天|聊了聊|聊聊"), "聊天"),
    (re.compile(r"散步|遛弯"), "一起散步"),
    (re.compile(r"看(了)?电影|电影"), "一起看电影"),
    (re.compile(r"拍照|拍摄|外拍"), "一起拍照"),
    (re.compile(r"点外卖|外卖"), "一起点外卖"),
    (re.compile(r"跨年"), "一起跨年"),
    (re.compile(r"视频通话|视频"), "视频通话"),
    (re.compile(r"打电话|通电话"), "通了个电话"),
    (re.compile(r"开会|组会"), "一起开会"),
)

#: 开场词：反复剥掉，直到句子不再以它们开头。
LEADIN_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^(今天|明天|后天|昨天|前天|上午|中午|下午|晚上|周末|上周|这周|本周)"),
    re.compile(r"^(然后|接着|后来|于是|所以|不过|但是|而且|又|再)"),
    re.compile(r"^(我|我们)(和|跟|与)"),
    re.compile(r"^(他|她|他们|她们|对方)"),
    re.compile(r"^(说|告诉(我|你)?|提到|讲|聊到|问|表示|觉得|认为)(过|了|着)?"),
    re.compile(r"^(和|跟|与)"),
)

#: 人名后若是这些动词，说明人名到此为止（“老陈喝咖啡”）。
_VERB_HEAD = "喝|吃|聊|见|来|去|说|发|给|送|问|买|拍|打|请|带|叫|陪|约|准备|在|最"

_ACTION_SPLIT_RE = re.compile(r"^(一起|一块|一同|和|跟|与|然后|接着|又|再)+")

#: 承诺句尾的接受者代词可以安全去掉，让文案更像一件“待办”。
_TRAILING_RECIPIENT_RE = re.compile(r"(给|向|跟)(他|她|他们|她们|它|您|你)$")

#: 借还物品名前面的冗余词。
_ITEM_CLEAN_RE = re.compile(r"^(我的|我那个|我那|那个|这个|一个|他的|她的|把|了)+")

MAX_TITLE_CHARS = 16
FALLBACK_TITLE = "记录一次互动"

_CONFIDENCE_EXACT = 0.96
_CONFIDENCE_NICKNAME = 0.9
_CONFIDENCE_PARTIAL = 0.7
_CONFIDENCE_SELECTED = 1.0


@dataclass(slots=True)
class KnownPerson:
    """解析时需要认识的人（来自当前用户的星图）。"""

    id: Any
    name: str
    nickname: str | None = None


@dataclass(slots=True)
class _Draft:
    """分类过程中攒下来的四类结果。"""

    updates: list[str] = field(default_factory=list)
    commitments: list[dict[str, Any]] = field(default_factory=list)
    important_dates: list[dict[str, Any]] = field(default_factory=list)
    borrows: list[dict[str, Any]] = field(default_factory=list)
    preferences: list[dict[str, Any]] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# 文本清理
# --------------------------------------------------------------------------- #


def split_clauses(text: str) -> list[str]:
    """按中英文标点切子句。"""
    return [part.strip() for part in date_terms.CLAUSE_SPLIT_RE.split(text or "") if part.strip()]


def strip_leadins(text: str, names: Sequence[str]) -> str:
    """剥掉开场词与人名，保留真正的内容。"""
    current = text.strip()
    for _ in range(6):
        before = current
        for pattern in LEADIN_PATTERNS:
            current = pattern.sub("", current, count=1).strip()
        for name in names:
            if not name:
                continue
            for pattern in (
                re.compile(rf"^{re.escape(name)}(和|跟|与)?"),
                re.compile(rf"^(和|跟|与){re.escape(name)}"),
                re.compile(rf"^{re.escape(name)}(?={_VERB_HEAD})"),
            ):
                current = pattern.sub("", current, count=1).strip()
        current = current.lstrip("，,、。 ")
        if current == before:
            break
    return current


def strip_particles(text: str) -> str:
    """去掉口语里的“了/过”，让内容更像一句留档的短句。"""
    return re.sub(r"(?<=[\u4e00-\u9fff])了|(?<=[\u4e00-\u9fff])过", "", text)


def _trim_title(text: str) -> str:
    """标题只保留一句短话，最多 16 个字。"""
    cleaned = _ACTION_SPLIT_RE.sub("", text.strip(" ，,、。"))
    cleaned = date_terms.DATE_GLUE_RE.sub("", cleaned).strip()
    cleaned = _ACTION_SPLIT_RE.sub("", cleaned).strip()
    if not cleaned:
        return ""
    return cleaned[:MAX_TITLE_CHARS]


def _date_free_text(text: str) -> str:
    """把日期表达从文本里剔掉，只留下事件本身。"""
    cleaned = text
    for _kind, pattern in date_terms.DATE_PATTERNS:
        cleaned = pattern.sub(" ", cleaned)
    cleaned = cleaned.replace("的", " ")
    return date_terms.DATE_GLUE_RE.sub("", cleaned.strip())


# --------------------------------------------------------------------------- #
# 子句分类
# --------------------------------------------------------------------------- #


def _has_commitment(text: str) -> bool:
    return any(marker in text for marker in COMMITMENT_MARKERS)


def _event_date(text: str, reference: date) -> tuple[str, DatePrecision, str | None] | None:
    """只有“日期表达 + 事件名词”同时出现，才算重要日期（§24 / §32）。"""
    if date_terms.is_birthday(text):
        return date_terms.parse_date_expression(text, reference)
    if date_terms.detect_event_noun(text) is None:
        return None
    return date_terms.parse_date_expression(text, reference)


def _looks_like_update(text: str) -> bool:
    return any(marker in text for marker in UPDATE_MARKERS)


def _update_text(text: str, names: Sequence[str]) -> str:
    """把一句近况收成 ``“最近开始学剪辑”`` 这种简短陈述。"""
    body = strip_leadins(text, names)
    body = re.sub(r"^(说|告诉(我|你)?|提到|讲|聊到|表示|觉得|认为)(过|了|着)?", "", body)
    body = re.sub(r"^(已经|还|也|就|又|再)", "", body)
    body = strip_particles(body)
    # “想开始学剪辑” → “最近想开始学剪辑” → “最近开始学剪辑”
    body = re.sub(r"^(打算|准备|要|想)", r"最近\1", body)
    body = re.sub(r"^最近(打算|准备|要|想)", "最近", body)
    body = re.sub(r"^(打算|准备|要|想)", "", body)
    return body.strip(" ，,、。")


def _commitment_text(text: str, names: Sequence[str]) -> str:
    """把一句承诺收成 ``“把租房网站发给他”``。"""
    body = strip_leadins(text, names)
    body = re.sub(r"^(我)?(答应|承诺|记得|回头|下次)(过|了)?", "", body).strip()
    body = strip_particles(body).strip(" ，,、。")
    # 移除人名后可能留下一个悬空的“给”（例如“发给老陈” → “发给”），补掉它；
    # 但“给他/给她”是承诺内容的一部分，必须保留（§45 / §30 的示例都以“发给他”结尾）。
    body = re.sub(r"给$", "", body).strip(" ，,、。")
    return body


def _important_date_title(text: str) -> str:
    """从“下个月准备参加一个短片比赛”里抽出“短片比赛”。"""
    body = _date_free_text(text)
    body = re.sub(r"(准备|打算|将要?|计划|会|有一场|一场|一个|参加|举办|想要)", " ", body)
    # 剥掉残留的“她要 / 他打算”这类主语+助动词，别让标题变成半截话。
    body = re.sub(r"^(他|她|他们|她们|我)(要|会|想|打算|准备|将)?", " ", body)
    body = re.sub(r"^(的|了|是|要|会|想)+", "", body.strip())
    return " ".join(body.split()).strip(" ，,、。")


def _borrow_direction(text: str) -> BorrowDirection | None:
    if date_terms.BORROW_LEND_RE.search(text):
        return BorrowDirection.LENT_TO
    if date_terms.BORROW_TAKE_RE.search(text):
        return BorrowDirection.BORROWED_FROM
    return None


def _preference_kind(text: str) -> tuple[PreferenceCategory, str] | None:
    """命中偏好关键词就返回 ``(归类, 命中的词)``。

    「不喜欢」必须排在「喜欢」前面，否则前者会被后者抢先匹配。
    """
    for marker, category in PREFERENCE_MARKERS:
        if marker in text:
            return category, marker
    return None


def _preference_text(text: str, names: Sequence[str], marker: str) -> str:
    """把「林夕喜欢喝手冲咖啡」收成「喜欢手冲咖啡」。"""
    body = strip_leadins(text, names)
    body = re.sub(r"^(他|她|他们|她们)(还|也|就|最|很|挺|特别|非常|一直|平时)*", "", body).strip()
    # 只保留从关键词开始的部分，前面的语气词都丢掉。
    index = body.find(marker)
    if index > 0:
        body = body[index:]
    body = strip_particles(body).strip(" ，,、。")
    return body


def _borrow_item(text: str, names: Sequence[str] = ()) -> str:
    """从“她借走了我的 50mm 镜头”里抽出“50mm 镜头”。"""
    cleaned = date_terms.BORROW_ITEM_RE.sub(" ", text, count=1)
    cleaned = re.sub(r"(我|他|她|你)", " ", cleaned)
    # “我借了陈屿一本摄影集”里的名字要拿掉，否则物品名会带上人名。
    for name in names:
        if name:
            cleaned = cleaned.replace(name, " ")
    cleaned = _ITEM_CLEAN_RE.sub("", cleaned.strip())
    cleaned = re.sub(r"^(的|了)+", "", cleaned.strip())
    return " ".join(cleaned.split()).strip(" ，,、。")


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #


def _interaction_title(clauses: Sequence[str], names: Sequence[str]) -> str:
    """互动的标题：优先用识别到的动作，否则退回第一句的短版本。"""
    for clause in clauses:
        for pattern, title in ACTIONS:
            if pattern.search(clause):
                return title
    if clauses:
        candidate = _trim_title(strip_leadins(clauses[0], names))
        if candidate:
            return candidate
    return FALLBACK_TITLE


def parse_rules(
    text: str,
    *,
    reference_date: date,
    known_people: Iterable[KnownPerson] = (),
    selected_person_id: Any = None,
) -> ParseResult:
    """规则解析主入口，返回与 LLM 完全一致的 :class:`ParseResult`。"""
    people = list(known_people)
    clauses = split_clauses(text)
    names = [person.name for person in people] + [person.nickname or "" for person in people]

    candidates = match_people(text, people, selected_person_id=selected_person_id)
    draft = _Draft()

    for raw in clauses:
        if _has_commitment(raw):
            content = _commitment_text(raw, names)
            if content:
                draft.commitments.append({"content": content, "dueDate": None, "dueText": None})
            continue

        if "借" in raw:
            direction = _borrow_direction(raw)
            if direction is not None:
                item = _borrow_item(raw, names)
                if item:
                    draft.borrows.append({"direction": direction, "itemName": item, "borrowDate": None})
                continue

        # 偏好要排在近况前面：UPDATE_MARKERS 里有「想」，
        # 「想去重庆」既像近况也像愿望，按偏好处理信息量更大。
        preference = _preference_kind(raw)
        if preference is not None:
            category, marker = preference
            content = _preference_text(raw, names, marker)
            if content:
                draft.preferences.append({"category": category, "content": content})
                continue

        if date_terms.is_birthday(raw):
            found = date_terms.parse_date_expression(raw, reference_date)
            if found is not None:
                raw_date, precision, value = found
                draft.important_dates.append(
                    {
                        "title": "生日",
                        "date": value,
                        "dateText": raw_date,
                        "datePrecision": precision,
                        "repeatType": RepeatType.YEARLY,
                    }
                )
                continue

        found_date = _event_date(raw, reference_date)
        if found_date is not None:
            raw_date, precision, value = found_date
            title = _important_date_title(raw) or _date_free_text(raw)
            if title:
                draft.important_dates.append(
                    {
                        "title": title,
                        "date": value,
                        "dateText": raw_date,
                        "datePrecision": precision,
                        "repeatType": RepeatType.NONE,
                    }
                )
                continue

        if _looks_like_update(raw):
            body = _update_text(raw, names)
            if body:
                draft.updates.append(body)

    interaction = ParsedInteraction(
        title=_interaction_title(clauses, names),
        content=text,
        interaction_date=reference_date.isoformat(),
        location=None,
        interaction_type=None,
    )

    return ParseResult(
        parser="rules",
        person_candidates=candidates,
        interaction=interaction,
        updates=[ParsedUpdate(content=content) for content in _dedupe(draft.updates)],        commitments=[
            ParsedCommitment(content=item["content"], due_date=item["dueDate"], due_text=item["dueText"])
            for item in _dedupe_payloads(draft.commitments)
        ],
        important_dates=[
            ParsedImportantDate(
                title=item["title"],
                date=item["date"],
                date_text=item["dateText"],
                date_precision=item["datePrecision"],
                repeat_type=item["repeatType"],
            )
            for item in _dedupe_payloads(draft.important_dates, key="title")
        ],
        preferences=[
            ParsedPreference(category=item["category"], content=item["content"])
            for item in _dedupe_payloads(draft.preferences)
        ],
        borrow_records=[
            ParsedBorrow(
                direction=item["direction"],
                item_name=item["itemName"],
                borrow_date=item["borrowDate"],
            )
            for item in _dedupe_payloads(draft.borrows, key="itemName")
        ],
    )


def match_people(
    text: str,
    people: Sequence[KnownPerson],
    *,
    selected_person_id: Any = None,
) -> list[PersonCandidate]:
    """按文本匹配已知人物；置信度：完全同名 0.96、昵称 0.9、部分 0.7、已选 1.0。"""
    candidates: list[PersonCandidate] = []
    for person in people:
        if person.name and person.name in text:
            candidates.append(PersonCandidate(id=person.id, name=person.name, confidence=_CONFIDENCE_EXACT))
            continue
        if person.nickname and person.nickname in text:
            candidates.append(PersonCandidate(id=person.id, name=person.name, confidence=_CONFIDENCE_NICKNAME))

    if not candidates and selected_person_id is not None:
        selected = next((person for person in people if person.id == selected_person_id), None)
        candidates.append(
            PersonCandidate(
                id=selected_person_id,
                name=selected.name if selected is not None else "",
                confidence=_CONFIDENCE_SELECTED,
            )
        )

    return candidates


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def _dedupe_payloads(items: list[dict[str, Any]], key: str = "content") -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        marker = str(item.get(key, ""))
        if not marker or marker in seen:
            continue
        seen.add(marker)
        result.append(item)
    return result


__all__ = [
    "COMMITMENT_MARKERS",
    "FALLBACK_TITLE",
    "KnownPerson",
    "match_people",
    "parse_rules",
    "split_clauses",
    "strip_leadins",
]
