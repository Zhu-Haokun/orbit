"""AI 解析统一入口（规范 §31 / §32 / §45 / §46）。

对外只有一个函数 :func:`parse_interaction`：

* 配好 ``LLM_API_KEY`` 与 ``LLM_MODEL`` 时走真实模型；
* 缺配置、网络失败、返回非 JSON、字段不合法……**任何**异常都退回规则解析，
  并把 ``parser`` 标成 ``"rules"``——调用方永远看不到技术错误（§31）。
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.ai import llm_parser, rules_parser
from app.ai.rules_parser import KnownPerson
from app.models.enums import (
    BorrowDirection,
    DatePrecision,
    ParserKind,
    PreferenceCategory,
    RepeatType,
)
from app.models.person import Person
from app.schemas.ai import (
    ParsedBorrow,
    ParsedCommitment,
    ParsedImportantDate,
    ParsedInteraction,
    ParsedPreference,
    ParsedUpdate,
    ParseRequest,
    ParseResult,
    PersonCandidate,
)

logger = logging.getLogger(__name__)


def known_people_for(db: Session, user_id: uuid.UUID) -> list[KnownPerson]:
    """当前用户星图里的人，作为人物匹配的"已知人物集合"。"""
    rows = db.execute(sa.select(Person.id, Person.name, Person.nickname).where(Person.user_id == user_id)).all()
    return [KnownPerson(id=row.id, name=row.name, nickname=row.nickname) for row in rows]


def parse_interaction(db: Session, user_id: uuid.UUID, request: ParseRequest) -> ParseResult:
    """解析一段自然语言，返回与前端契约一致的 ``ParseResult``。"""
    people = known_people_for(db, user_id)

    if llm_parser.is_configured():
        try:
            raw = llm_parser.request_json(
                request.text,
                reference_date=request.reference_date,
                known_people=[person.name for person in people],
            )
            return _from_llm(raw, request, people)
        except Exception as exc:  # noqa: BLE001 - 这里是刻意的兜底边界
            logger.warning("LLM 解析失败，改用规则解析：%s", exc)

    return rules_parser.parse_rules(
        request.text,
        reference_date=request.reference_date,
        known_people=people,
        selected_person_id=request.selected_person_id,
    )


# --------------------------------------------------------------------------- #
# LLM 结果规范化
# --------------------------------------------------------------------------- #


def _as_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value.strip()
    return str(value)


def _as_optional_text(value: Any) -> str | None:
    text = _as_text(value)
    return text or None


def _as_iso_date(value: Any) -> str | None:
    text = _as_text(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def _as_items(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def _from_llm(raw: dict[str, Any], request: ParseRequest, people: Sequence[KnownPerson]) -> ParseResult:
    """把模型返回的 JSON 收进契约结构；缺字段用安全默认值补齐。"""
    interaction_raw = raw.get("interaction")
    interaction_raw = interaction_raw if isinstance(interaction_raw, dict) else {}
    content = _as_text(interaction_raw.get("content")) or request.text
    title = (
        _as_text(interaction_raw.get("title")) or content[: rules_parser.MAX_TITLE_CHARS] or rules_parser.FALLBACK_TITLE
    )
    interaction_date = _as_iso_date(interaction_raw.get("interactionDate")) or request.reference_date.isoformat()

    candidates: list[PersonCandidate] = []
    for item in _as_items(raw.get("personCandidates")):
        name = _as_text(item.get("name"))
        if not name:
            continue
        matched = _match_known(name, people)
        confidence = item.get("confidence")
        try:
            score = float(confidence)
        except (TypeError, ValueError):
            score = 0.0
        candidates.append(
            PersonCandidate(
                id=matched.id if matched is not None else None,
                name=matched.name if matched is not None else name,
                confidence=score,
            )
        )
    if not candidates and request.selected_person_id is not None:
        selected = next((person for person in people if person.id == request.selected_person_id), None)
        candidates.append(
            PersonCandidate(
                id=request.selected_person_id,
                name=selected.name if selected is not None else "",
                confidence=1.0,
            )
        )

    updates = [
        ParsedUpdate(content=text) for item in _as_items(raw.get("updates")) if (text := _as_text(item.get("content")))
    ]

    commitments = [
        ParsedCommitment(
            content=text,
            due_date=_as_iso_date(item.get("dueDate")),
            due_text=_as_optional_text(item.get("dueText")),
        )
        for item in _as_items(raw.get("commitments"))
        if (text := _as_text(item.get("content")))
    ]

    important_dates: list[ParsedImportantDate] = []
    for item in _as_items(raw.get("importantDates")):
        title_text = _as_text(item.get("title"))
        if not title_text:
            continue
        important_dates.append(
            ParsedImportantDate(
                title=title_text,
                date=_as_iso_date(item.get("date")),
                date_text=_as_optional_text(item.get("dateText")),
                date_precision=_coerce_precision(item.get("datePrecision")),
                repeat_type=_coerce_repeat(item.get("repeatType")),
            )
        )

    preferences = [
        ParsedPreference(category=_coerce_category(item.get("category")), content=text)
        for item in _as_items(raw.get("preferences"))
        if (text := _as_text(item.get("content")))
    ]

    borrow_records = [
        ParsedBorrow(
            direction=_coerce_direction(item.get("direction")),
            item_name=text,
            borrow_date=_as_iso_date(item.get("borrowDate")),
        )
        for item in _as_items(raw.get("borrowRecords"))
        if (text := _as_text(item.get("itemName")))
    ]

    return ParseResult(
        parser=ParserKind.LLM,
        person_candidates=candidates,
        interaction=ParsedInteraction(
            title=title[:200],
            content=content,
            interaction_date=interaction_date,
            location=_as_optional_text(interaction_raw.get("location")),
            interaction_type=_as_optional_text(interaction_raw.get("interactionType")),
        ),
        updates=updates,
        commitments=commitments,
        important_dates=important_dates,
        preferences=preferences,
        borrow_records=borrow_records,
    )


def _coerce_enum(value: Any, allowed: tuple[str, ...], fallback: str) -> str:
    text = _as_text(value).lower()
    return text if text in allowed else fallback


def _coerce_precision(value: Any) -> DatePrecision:
    return DatePrecision(_coerce_enum(value, tuple(item.value for item in DatePrecision), DatePrecision.EXACT.value))


def _coerce_repeat(value: Any) -> RepeatType:
    return RepeatType(_coerce_enum(value, tuple(item.value for item in RepeatType), RepeatType.NONE.value))


def _coerce_category(value: Any) -> PreferenceCategory:
    return PreferenceCategory(
        _coerce_enum(value, tuple(item.value for item in PreferenceCategory), PreferenceCategory.OTHER.value)
    )


def _coerce_direction(value: Any) -> BorrowDirection:
    return BorrowDirection(
        _coerce_enum(value, tuple(item.value for item in BorrowDirection), BorrowDirection.LENT_TO.value)
    )


def _match_known(name: str, people: Sequence[KnownPerson]) -> KnownPerson | None:
    for person in people:
        if person.name == name or (person.nickname and person.nickname == name):
            return person
    return None


__all__ = ["known_people_for", "parse_interaction"]
