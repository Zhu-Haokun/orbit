"""回忆页聚合（规范 §34）——把关系数据重新变成“记忆”。

只回答“那段时间我们一起做过什么”，不做排名、不做“最重要的人”（§34.4）。
"""

from __future__ import annotations

import uuid
from calendar import month_abbr
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session, selectinload

from app.models.group import people_groups
from app.models.interaction import Interaction
from app.models.person import Person

#: 年度摘要里的“地点”来自 interaction.location。
MONTH_LABELS = tuple(name.upper() for name in month_abbr[1:])


def _base_query(
    user_id: uuid.UUID,
    year: int | None,
    group_id: uuid.UUID | None,
    location: str | None = None,
    person_id: uuid.UUID | None = None,
):
    stmt = sa.select(Interaction).where(
        Interaction.user_id == user_id,
        # 未整理的「先记下来」不算回忆。
        Interaction.is_draft.is_(False),
    )
    if year is not None:
        # extract() 在 SQLite 与 PostgreSQL 上都能编译，比拼接字符串日期稳妥。
        stmt = stmt.where(sa.extract("year", Interaction.interaction_date) == year)
    if group_id is not None:
        stmt = stmt.join(
            people_groups,
            sa.and_(
                people_groups.c.person_id == Interaction.person_id,
                people_groups.c.group_id == group_id,
            ),
        )
    # 从右侧索引栏点进来时用：按地点 / 按人物收窄。
    if location:
        stmt = stmt.where(Interaction.location == location)
    if person_id is not None:
        stmt = stmt.where(Interaction.person_id == person_id)
    return stmt


def _available_years(db: Session, user_id: uuid.UUID) -> list[int]:
    """数据里出现过的年份，最新在前——用于顶部时间筛选（§34.2）。"""
    rows = db.execute(
        sa.select(sa.extract("year", Interaction.interaction_date)).where(
            Interaction.user_id == user_id,
            Interaction.is_draft.is_(False),
        )
    ).all()
    years = {int(row[0]) for row in rows if row[0] is not None}
    return sorted(years, reverse=True)


def _group_names(person: Person | None) -> list[str]:
    if person is None:
        return []
    return [group.name for group in sorted(person.groups, key=lambda item: (item.sort_order, item.name))]


def _shared_event_people(
    db: Session, user_id: uuid.UUID, interactions: list[Interaction]
) -> dict[uuid.UUID, list[dict[str, Any]]]:
    """``event_id`` → 那次经历里出现过的所有人。

    互动的 ``person_id`` 只有一个，但"和谁一起"应该把同框的人都算上 ——
    否则一次三人外拍，在回忆里只会显示一个人。
    """
    event_ids = {item.event_id for item in interactions if item.event_id is not None}
    if not event_ids:
        return {}

    rows = db.execute(
        sa.select(Interaction.event_id, Person)
        .join(Person, Person.id == Interaction.person_id)
        .where(
            Interaction.user_id == user_id,
            Interaction.event_id.in_(event_ids),
            Interaction.is_draft.is_(False),
        )
        .order_by(Person.name)
    ).all()

    result: dict[uuid.UUID, list[dict[str, Any]]] = {}
    for event_id, person in rows:
        bucket = result.setdefault(event_id, [])
        if all(entry["id"] != person.id for entry in bucket):
            bucket.append(
                {
                    "id": person.id,
                    "name": person.name,
                    "avatar_url": person.avatar_url,
                    "relationship_label": person.relationship_label,
                }
            )
    return result


def build_memories(
    db: Session,
    user_id: uuid.UUID,
    *,
    year: int | None = None,
    group_id: uuid.UUID | None = None,
    location: str | None = None,
    person_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """组装 ``MemoriesPayload``：按月的记忆流 + 年度摘要。

    右侧索引栏完全由这个返回值推导，所以索引里出现的月份 / 人物 / 地点
    一定是当前筛选结果里真实存在的 —— 不会显示与结果无关的统计。
    """
    years = _available_years(db, user_id)

    interactions = (
        db.execute(
            _base_query(user_id, year, group_id, location, person_id)
            .options(
                selectinload(Interaction.attachments),
                selectinload(Interaction.comments),
                selectinload(Interaction.person).selectinload(Person.groups),
            )
            .order_by(Interaction.interaction_date.desc(), Interaction.created_at.desc())
        )
        .scalars()
        .unique()
        .all()
    )

    months: list[dict[str, Any]] = []
    bucket: dict[tuple[int, int], dict[str, Any]] = {}
    person_ids: set[uuid.UUID] = set()
    place_names: set[str] = set()

    # 同一次共同经历（同一个 event_id）下的所有人。
    # 互动的 person_id 只有一个，但"和谁一起"应该把同框的人都算上。
    shared_people = _shared_event_people(db, user_id, interactions)
    seen_events: set[uuid.UUID] = set()

    for interaction in interactions:
        # 同一次共同经历为每个人各存了一条 —— 时间轴里只显示一次，
        # 参与者由上面的 shared_people 一并列出。
        if interaction.event_id is not None:
            if interaction.event_id in seen_events:
                continue
            seen_events.add(interaction.event_id)

        moment = interaction.interaction_date
        key_tuple = (moment.year, moment.month)
        month = bucket.get(key_tuple)
        if month is None:
            month = {
                "key": f"{moment.year:04d}-{moment.month:02d}",
                "year": moment.year,
                "month": moment.month,
                "label": MONTH_LABELS[moment.month - 1],
                "items": [],
            }
            bucket[key_tuple] = month
            months.append(month)

        person = interaction.person
        if person is not None:
            person_ids.add(person.id)
        if interaction.location:
            place_names.add(interaction.location.strip())

        month["items"].append(
            {
                "interaction_id": interaction.id,
                "title": interaction.title,
                "content": interaction.content,
                "date": moment.date(),
                "location": interaction.location,
                "people": (
                    shared_people.get(interaction.event_id)
                    or (
                        [
                            {
                                "id": person.id,
                                "name": person.name,
                                "avatar_url": person.avatar_url,
                                "relationship_label": person.relationship_label,
                            }
                        ]
                        if person is not None
                        else []
                    )
                ),
                "group_names": _group_names(person),
                "attachments": interaction.attachments,
                "comments": interaction.comments,
                "mood": interaction.mood,
                "is_self": bool(person is not None and person.is_self),
            }
        )

    months.sort(key=lambda item: (item["year"], item["month"]), reverse=True)

    return {
        "year": year,
        "years": years,
        "months": months,
        "summary": {
            "year": year,
            "interaction_count": len(interactions),
            "people_count": len(person_ids),
            "place_count": len(place_names),
        },
    }


__all__ = ["MONTH_LABELS", "build_memories"]
