"""今天页聚合（规范 §33 / §45 Today）。

一句话原则：这里只回答“今天有哪些与我在乎的人有关的信息值得看一眼”，
它不是任务列表，也不能出现催办或评分（§5.1 / §5.2 / §33.5）。
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.enums import (
    OPEN_COMMITMENT_STATUSES,
    BorrowStatus,
    DatePrecision,
)
from app.models.important_date import ImportantDate
from app.models.interaction import Interaction
from app.models.person import Person
from app.services.person_service import effective_next_date, today_local

#: §33.2 重要日期区间的宽度：今天 + 接下来 14 天。
UPCOMING_WINDOW_DAYS = 14

#: §33.5 “有一阵子没有新的记录”的阈值（天）。
STALE_AFTER_DAYS = 45

#: 去年同期的记忆窗口：同月同日 ±10 天（§33.3）。
LAST_YEAR_WINDOW_DAYS = 10

#: 值得回看的记忆最多展示 5 条。
MAX_MEMORY_PROMPTS = 5


def _person_ref(person: Person | None) -> dict[str, Any] | None:
    if person is None:
        return None
    return {
        "id": person.id,
        "name": person.name,
        "avatar_url": person.avatar_url,
        "relationship_label": person.relationship_label,
    }


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _as_recorded_at(value: datetime | None) -> datetime | None:
    """“记录日期”只到天：单独存 ``date`` 的列也补成当天 00:00 UTC。

    否则前端拿到的会是一个与 ``interactionDate`` 口径不同的时间点，
    容易出现“昨天记录”差一天的问题。
    """
    if value is None:
        return None
    aware = _as_aware(value)
    if isinstance(value, datetime):
        return aware
    return datetime.combine(value, time.min, tzinfo=UTC)


def _last_year_memory(db: Session, user_id: uuid.UUID, person_id: uuid.UUID, target: date) -> Interaction | None:
    """去年同月同日 ±10 天里，与这个人有关的一条记录。"""
    try:
        anniversary = target.replace(year=target.year - 1)
    except ValueError:
        anniversary = date(target.year - 1, 2, 28)

    start = datetime.combine(anniversary - timedelta(days=LAST_YEAR_WINDOW_DAYS), time.min, tzinfo=UTC)
    end = datetime.combine(anniversary + timedelta(days=LAST_YEAR_WINDOW_DAYS), time.max, tzinfo=UTC)
    stmt = (
        sa.select(Interaction)
        .where(
            Interaction.user_id == user_id,
            Interaction.person_id == person_id,
            Interaction.is_draft.is_(False),
            Interaction.interaction_date >= start,
            Interaction.interaction_date <= end,
        )
        .order_by(Interaction.interaction_date.desc())
        .limit(1)
    )
    return db.execute(stmt).scalars().first()


def _important_dates(db: Session, user_id: uuid.UUID, today: date) -> list[dict[str, Any]]:
    """今天发生、或接下来 14 天内发生的重要日期（可比较精度）。"""
    rows = (
        db.execute(
            sa.select(ImportantDate)
            .join(Person, Person.id == ImportantDate.person_id)
            .where(
                Person.user_id == user_id,
                ImportantDate.date.is_not(None),
                ImportantDate.date_precision.in_([DatePrecision.EXACT, DatePrecision.MONTH]),
            )
        )
        .scalars()
        .all()
    )
    horizon = today + timedelta(days=UPCOMING_WINDOW_DAYS)
    items: list[dict[str, Any]] = []
    for row in rows:
        candidate = effective_next_date(row.date, row.date_precision, row.repeat_type, today=today)
        if candidate is None or candidate < today or candidate > horizon:
            continue
        person = row.person
        memory = _last_year_memory(db, user_id, row.person_id, candidate)
        items.append(
            {
                "id": row.id,
                "person_id": row.person_id,
                "title": row.title,
                "date": candidate,
                "date_text": row.date_text,
                "date_precision": row.date_precision,
                "repeat_type": row.repeat_type,
                "notes": row.notes,
                "created_at": row.created_at,
                "person": _person_ref(person),
                "is_today": candidate == today,
                "in_days": (candidate - today).days,
                "last_year_memory": (
                    {
                        "title": memory.title,
                        "content": memory.content,
                        "date": _as_aware(memory.interaction_date),
                    }
                    if memory is not None
                    else None
                ),
            }
        )

    items.sort(key=lambda item: (item["date"], item["title"]))
    return items


def _commitments(db: Session, user_id: uuid.UUID) -> list[dict[str, Any]]:
    """未完成的未完待续，附带它是在哪一天的记录里被答应下来的（§33.4）。"""
    rows = db.execute(
        sa.select(Commitment, Interaction.interaction_date)
        .outerjoin(Interaction, Interaction.id == Commitment.source_interaction_id)
        .where(Commitment.user_id == user_id, Commitment.status.in_(OPEN_COMMITMENT_STATUSES))
        .order_by(Commitment.due_date.asc().nullslast(), Commitment.created_at.asc())
    ).all()
    items: list[dict[str, Any]] = []
    for commitment, source_date in rows:
        items.append(
            {
                "id": commitment.id,
                "person_id": commitment.person_id,
                "content": commitment.content,
                "due_date": _as_aware(commitment.due_date),
                "due_text": commitment.due_text,
                "status": commitment.status,
                "source_interaction_id": commitment.source_interaction_id,
                "created_at": commitment.created_at,
                "completed_at": _as_aware(commitment.completed_at),
                "person": _person_ref(commitment.person),
                "recorded_at": _as_recorded_at(source_date) or _as_aware(commitment.created_at),
            }
        )
    return items


def _borrow_records(db: Session, user_id: uuid.UUID) -> list[dict[str, Any]]:
    """还没还的东西（§26 / §33.2 第三区）。"""
    rows = (
        db.execute(
            sa.select(BorrowRecord)
            .where(BorrowRecord.user_id == user_id, BorrowRecord.status == BorrowStatus.OPEN)
            .order_by(BorrowRecord.borrow_date.desc())
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": row.id,
            "person_id": row.person_id,
            "direction": row.direction,
            "item_name": row.item_name,
            "amount": row.amount,
            "borrow_date": row.borrow_date,
            "expected_return_date": row.expected_return_date,
            "status": row.status,
            "notes": row.notes,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "person": _person_ref(row.person),
        }
        for row in rows
    ]


def _memory_prompts(db: Session, user_id: uuid.UUID, today: date) -> list[dict[str, Any]]:
    """§33.5：最近一条记录已经超过 45 天的人，最多 5 个，越久没记录越靠前。

    文案上只陈述事实（“有一阵子没有新的记录”），绝不催促。
    """
    newest = (
        sa.select(
            Interaction.person_id.label("person_id"),
            Interaction.title.label("title"),
            Interaction.content.label("content"),
            Interaction.interaction_date.label("interaction_date"),
            sa.func.row_number()
            .over(
                partition_by=Interaction.person_id,
                order_by=(Interaction.interaction_date.desc(), Interaction.created_at.desc()),
            )
            .label("rank"),
        )
        .where(Interaction.user_id == user_id, Interaction.is_draft.is_(False))
        .subquery()
    )

    rows = db.execute(
        sa.select(newest, Person)
        .join(Person, Person.id == newest.c.person_id)
        .where(newest.c.rank == 1)
        .order_by(newest.c.interaction_date.asc())
    ).all()

    cutoff = today - timedelta(days=STALE_AFTER_DAYS)
    prompts: list[dict[str, Any]] = []
    for row in rows:
        interaction_date = _as_aware(row.interaction_date)
        if interaction_date is None or interaction_date.date() > cutoff:
            continue
        prompts.append(
            {
                "person": _person_ref(row.Person),
                "last_interaction_at": interaction_date,
                "last_interaction_title": row.title,
                "last_interaction_content": row.content,
                "days_since": (today - interaction_date.date()).days,
            }
        )
        if len(prompts) >= MAX_MEMORY_PROMPTS:
            break
    return prompts


def build_today(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """组装 ``TodayPayload`` 的四块内容。"""
    today = today_local()
    important_dates = _important_dates(db, user_id, today)
    commitments = _commitments(db, user_id)
    borrow_records = _borrow_records(db, user_id)
    memory_prompts = _memory_prompts(db, user_id, today)

    return {
        "date": today,
        # §33.1：“今天有 3 件与你在乎的人有关的事情。”
        # 只统计重要日期 + 未完待续 + 借还，记忆提示不计入。
        "headline_count": len(important_dates) + len(commitments) + len(borrow_records),
        "important_dates": important_dates,
        "commitments": commitments,
        "borrow_records": borrow_records,
        "memory_prompts": memory_prompts,
    }


__all__ = ["STALE_AFTER_DAYS", "UPCOMING_WINDOW_DAYS", "build_today"]
