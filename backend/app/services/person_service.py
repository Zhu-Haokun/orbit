"""人物相关服务：派生字段、建档、完整档案与删除级联（规范 §21 §24 §44 §58）。

派生字段全部在响应前算好并挂到 ORM 对象上（Pydantic 用 ``from_attributes`` 读取）：

* ``last_interaction_at`` / ``interaction_count``
* ``latest_update`` —— 最近一条 ``active`` 的近况
* ``open_commitment_count`` —— ``open`` + ``later``
* ``next_important_date`` —— 最近一个尚未过去的重要日期
* ``groups`` —— ``GroupRef`` 列表

这些值不落库：规范 §44 只定义原始列，派生值属于展示层计算。
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from datetime import UTC, date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session, selectinload

from app.models.attachment import Attachment
from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.enums import (
    OPEN_COMMITMENT_STATUSES,
    DatePrecision,
    RepeatType,
    UpdateStatus,
)
from app.models.group import Group, people_groups
from app.models.important_date import ImportantDate
from app.models.interaction import Interaction
from app.models.person import Person
from app.models.person_update import PersonUpdate
from app.models.preference import Preference

#: 人物详情里一次带出的全部子集合。
_DETAIL_OPTIONS = (
    selectinload(Person.groups),
    selectinload(Person.interactions).selectinload(Interaction.attachments),
    selectinload(Person.updates),
    selectinload(Person.commitments),
    selectinload(Person.important_dates),
    selectinload(Person.preferences),
    selectinload(Person.borrow_records),
)


def today_local() -> date:
    """今天（服务器本地日历日）。所有“今天”判断都以它为基准。"""
    return datetime.now().date()


# --------------------------------------------------------------------------- #
# 重要日期：可比较的“下一次发生”
# --------------------------------------------------------------------------- #


def effective_next_date(
    value: date | None,
    precision: DatePrecision,
    repeat: RepeatType,
    *,
    today: date,
) -> date | None:
    """把一条重要日期折算成“下一次发生的日子”。

    §24 支持四种精度，但只有 ``exact`` 与 ``month`` 可以比较：
    ``month`` 取当月 1 日；``season`` / ``text`` 没有可比较的日期，返回 ``None``。
    ``repeat_type == "yearly"`` 时把日期滚动到今年或明年（生日场景）。
    """
    if value is None or precision in (DatePrecision.SEASON, DatePrecision.TEXT):
        return None

    candidate = value
    if precision == DatePrecision.MONTH:
        candidate = date(value.year, value.month, 1)

    if repeat == RepeatType.YEARLY:
        try:
            candidate = candidate.replace(year=today.year)
        except ValueError:  # 2 月 29 日
            candidate = date(today.year, 2, 28)
        if candidate < today:
            try:
                candidate = candidate.replace(year=today.year + 1)
            except ValueError:
                candidate = date(today.year + 1, 2, 28)

    return candidate


def _is_upcoming(value: date | None, precision: DatePrecision, repeat: RepeatType, today: date) -> bool:
    """这条重要日期是否还没有过去（今天页与 ``nextImportantDate`` 共用判断）。"""
    candidate = effective_next_date(value, precision, repeat, today=today)
    return candidate is not None and candidate >= today


# --------------------------------------------------------------------------- #
# 一次性查询：统计、最近近况、下一件重要日期
# --------------------------------------------------------------------------- #


def _stats_stmt(user_id: uuid.UUID):
    return (
        sa.select(
            Interaction.person_id.label("person_id"),
            sa.func.count(Interaction.id).label("interaction_count"),
            sa.func.max(Interaction.interaction_date).label("last_interaction_at"),
        )
        .where(Interaction.user_id == user_id, Interaction.is_draft.is_(False))
        .group_by(Interaction.person_id)
    )


def _open_commitment_stmt(user_id: uuid.UUID):
    return (
        sa.select(
            Commitment.person_id.label("person_id"),
            sa.func.count(Commitment.id).label("open_count"),
        )
        .where(Commitment.user_id == user_id, Commitment.status.in_(OPEN_COMMITMENT_STATUSES))
        .group_by(Commitment.person_id)
    )


def _latest_update_stmt(person_ids: Sequence[uuid.UUID]):
    """每个 person 最近一条 active 近况；SQLite 与 PostgreSQL 都支持窗口函数。"""
    if not person_ids:
        return None
    ranked = (
        sa.select(
            PersonUpdate.person_id.label("person_id"),
            PersonUpdate.content.label("content"),
            sa.func.row_number()
            .over(
                partition_by=PersonUpdate.person_id,
                order_by=(PersonUpdate.created_at.desc(), PersonUpdate.id.desc()),
            )
            .label("rank"),
        )
        .where(PersonUpdate.person_id.in_(list(person_ids)), PersonUpdate.status == UpdateStatus.ACTIVE)
        .subquery()
    )
    return sa.select(ranked.c.person_id, ranked.c.content).where(ranked.c.rank == 1)


def _next_date_payload(db: Session, person_ids: Sequence[uuid.UUID], today: date) -> dict[uuid.UUID, dict[str, Any]]:
    """每个人的“下一个重要日期”，含 ``exact`` 与 ``month`` 两种可比较精度。"""
    if not person_ids:
        return {}

    stmt = (
        sa.select(ImportantDate)
        .where(
            ImportantDate.person_id.in_(list(person_ids)),
            ImportantDate.date.is_not(None),
            ImportantDate.date_precision.in_([DatePrecision.EXACT, DatePrecision.MONTH]),
        )
        .order_by(ImportantDate.date.asc())
    )
    # 这里直接复用 ORM 加载，数据量很小（Demo 级别），换来与 §24 完全一致的滚动逻辑。
    result: dict[uuid.UUID, dict[str, Any]] = {}
    for item in db.execute(stmt).scalars().all():
        candidate = effective_next_date(item.date, item.date_precision, item.repeat_type, today=today)
        if candidate is None or candidate < today:
            continue
        current = result.get(item.person_id)
        if current is None or candidate < current["value"]:
            result[item.person_id] = {
                "id": item.id,
                "title": item.title,
                "value": candidate,
                "date_text": item.date_text,
                "precision": item.date_precision,
                "repeat": item.repeat_type,
            }
    return result


def hydrate_people(db: Session, people: Sequence[Person], *, today: date | None = None) -> list[Person]:
    """给一批人物挂上派生字段（列表页、星图、导出都走同一条路径）。"""
    if not people:
        return []
    reference_day = today or today_local()
    person_ids = [person.id for person in people]

    stats = {row.person_id: row for row in db.execute(_stats_stmt(people[0].user_id)).all()}
    open_counts = {row.person_id: row.open_count for row in db.execute(_open_commitment_stmt(people[0].user_id))}

    latest_updates: dict[uuid.UUID, str] = {}
    stmt = _latest_update_stmt(person_ids)
    if stmt is not None:
        latest_updates = {row.person_id: row.content for row in db.execute(stmt).all()}

    next_dates = _next_date_payload(db, person_ids, reference_day)

    for person in people:
        row = stats.get(person.id)
        person.interaction_count = int(row.interaction_count) if row else 0
        person.last_interaction_at = row.last_interaction_at if row else None
        person.open_commitment_count = int(open_counts.get(person.id, 0))
        person.latest_update = latest_updates.get(person.id)
        upcoming = next_dates.get(person.id)
        person.next_important_date = (
            {
                "id": upcoming["id"],
                "title": upcoming["title"],
                "date": upcoming["value"],
                "date_text": upcoming["date_text"],
                "date_precision": upcoming["precision"],
                "repeat_type": upcoming["repeat"],
            }
            if upcoming
            else None
        )
        person.groups = sorted(person.groups, key=lambda group: (group.sort_order, group.name))
    return list(people)


def load_summaries(
    db: Session, user_id: uuid.UUID, *, group_id: uuid.UUID | None = None, search: str | None = None
) -> list[Person]:
    """列表页 / 星图的人物集合，按圈层与创建时间排序。

    刻意排除 ``is_self``：「我」不是星图上的一颗星，它是中心点，
    而且不该出现在"选择人物"这类列表里。它单独走 ``/api/me``。
    """
    stmt = sa.select(Person).where(Person.user_id == user_id, Person.is_self.is_(False))
    if group_id is not None:
        stmt = stmt.join(people_groups, people_groups.c.person_id == Person.id).where(
            people_groups.c.group_id == group_id
        )
    if search:
        keyword = f"%{search.strip()}%"
        stmt = stmt.where(
            sa.or_(
                Person.name.ilike(keyword),
                Person.nickname.ilike(keyword),
                Person.relationship_label.ilike(keyword),
            )
        )
    stmt = stmt.order_by(Person.created_at.asc())
    people = list(db.execute(stmt).scalars().unique().all())
    return hydrate_people(db, people)


def get_detail(db: Session, person: Person) -> Person:
    """加载完整档案：近况、未完待续、重要日期、偏好、借还、时间轴。"""
    detail = db.execute(sa.select(Person).options(*_DETAIL_OPTIONS).where(Person.id == person.id)).scalar_one()
    hydrate_people(db, [detail])

    # §21.2 的面板顺序：近况最新在前、未完待续未完成在前、时间轴最新在前。
    detail.updates = sorted(detail.updates, key=lambda item: item.created_at, reverse=True)
    # 未完成的排前面，组内按记录时间从新到旧。
    detail.commitments = sorted(
        detail.commitments,
        key=lambda item: (item.status not in OPEN_COMMITMENT_STATUSES, -item.created_at.timestamp()),
    )
    detail.important_dates = sorted(detail.important_dates, key=lambda item: (item.date is None, item.date or date.max))
    detail.preferences = sorted(detail.preferences, key=lambda item: item.created_at)
    detail.borrow_records = sorted(detail.borrow_records, key=lambda item: item.borrow_date, reverse=True)
    detail.interactions = sorted(detail.interactions, key=lambda item: item.interaction_date, reverse=True)
    detail.groups = sorted(detail.groups, key=lambda group: (group.sort_order, group.name))
    return detail


# --------------------------------------------------------------------------- #
# 写入与删除
# --------------------------------------------------------------------------- #


def resolve_groups(db: Session, user_id: uuid.UUID, group_ids: Iterable[uuid.UUID]) -> list[Group]:
    """把 ``groupIds`` 解析成属于当前用户的 Group 列表（别人的 id 直接忽略）。"""
    ids = list(dict.fromkeys(group_ids))
    if not ids:
        return []
    stmt = sa.select(Group).where(Group.user_id == user_id, Group.id.in_(ids))
    return list(db.execute(stmt).scalars().all())


def create_person(db: Session, user_id: uuid.UUID, payload: dict[str, Any], group_ids: Iterable[uuid.UUID]) -> Person:
    person = Person(user_id=user_id, **payload)
    person.groups = resolve_groups(db, user_id, group_ids)
    db.add(person)
    db.flush()
    return person


def update_person(
    db: Session, user_id: uuid.UUID, person: Person, changes: dict[str, Any], group_ids: Iterable[uuid.UUID] | None
) -> Person:
    for field, value in changes.items():
        setattr(person, field, value)
    if group_ids is not None:
        person.groups = resolve_groups(db, user_id, group_ids)
    db.flush()
    return person


def delete_person(db: Session, person: Person) -> None:
    """§58：删除人物与所有相关记录（V1 只实现这一种）。

    ``person_updates`` / ``important_dates`` / ``preferences`` 没有 ``user_id``，
    只能通过父级 person 收敛。这里显式逐表清理，不依赖数据库级联，
    这样 SQLite（默认不校验外键）与 PostgreSQL 的行为完全一致。
    """
    purge_person_data(db, [person.id])
    db.execute(sa.delete(Person).where(Person.id == person.id))


def purge_person_data(db: Session, person_ids: Sequence[uuid.UUID]) -> None:
    """删除一批人物名下的全部子记录（不含 people 行本身）。"""
    ids = list(person_ids)
    if not ids:
        return
    interaction_ids = sa.select(Interaction.id).where(Interaction.person_id.in_(ids))
    db.execute(sa.delete(Attachment).where(Attachment.interaction_id.in_(interaction_ids)))
    db.execute(sa.delete(Interaction).where(Interaction.person_id.in_(ids)))
    db.execute(sa.delete(PersonUpdate).where(PersonUpdate.person_id.in_(ids)))
    db.execute(sa.delete(Commitment).where(Commitment.person_id.in_(ids)))
    db.execute(sa.delete(ImportantDate).where(ImportantDate.person_id.in_(ids)))
    db.execute(sa.delete(Preference).where(Preference.person_id.in_(ids)))
    db.execute(sa.delete(BorrowRecord).where(BorrowRecord.person_id.in_(ids)))
    db.execute(sa.delete(people_groups).where(people_groups.c.person_id.in_(ids)))


def touch_person(person: Person) -> None:
    """互动变化后刷新 ``updated_at``，让前端知道这颗星有新内容。"""
    person.updated_at = datetime.now(UTC)


__all__ = [
    "create_person",
    "delete_person",
    "effective_next_date",
    "get_detail",
    "hydrate_people",
    "load_summaries",
    "purge_person_data",
    "resolve_groups",
    "today_local",
    "touch_person",
    "update_person",
]
