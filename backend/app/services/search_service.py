"""搜索服务（规范 §35 / §45 Search）。

范围：人物姓名 / 昵称 / 关系标签 / 星系名、互动的标题 / 内容 / 地点、
未完待续、偏好、借还物品名。大小写不敏感（SQLite 与 PostgreSQL 都用 ``ilike``）。
"""

from __future__ import annotations

import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session, selectinload

from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.group import Group, people_groups
from app.models.interaction import Interaction
from app.models.person import Person
from app.services.person_service import hydrate_people

#: 每个分类最多返回多少条，避免前端一次渲染过多。
PER_SECTION_LIMIT = 20


def _person_ref(person: Person | None) -> dict[str, Any] | None:
    if person is None:
        return None
    return {
        "id": person.id,
        "name": person.name,
        "avatar_url": person.avatar_url,
        "relationship_label": person.relationship_label,
    }


def _search_people(db: Session, user_id: uuid.UUID, keyword: str) -> list[dict[str, Any]]:
    pattern = f"%{keyword}%"

    matched_person_rows = (
        db.execute(
            sa.select(Person).where(
                Person.user_id == user_id,
                sa.or_(
                    Person.name.ilike(pattern),
                    Person.nickname.ilike(pattern),
                    Person.relationship_label.ilike(pattern),
                ),
            )
        )
        .scalars()
        .all()
    )

    people: dict[uuid.UUID, Person] = {}
    matched_in: dict[uuid.UUID, list[str]] = {}
    lowered = keyword.lower()
    for person in matched_person_rows:
        people[person.id] = person
        fields = matched_in.setdefault(person.id, [])
        for field_name, value in (
            ("name", person.name),
            ("nickname", person.nickname),
            ("relationshipLabel", person.relationship_label),
        ):
            if value and lowered in value.lower() and field_name not in fields:
                fields.append(field_name)

    # 星系名命中时，把该星系里的人也带出来（§35.1 支持按 group 搜）。
    group_rows = db.execute(
        sa.select(Person, Group.name)
        .join(people_groups, people_groups.c.person_id == Person.id)
        .join(Group, Group.id == people_groups.c.group_id)
        .where(Person.user_id == user_id, Group.name.ilike(pattern))
    ).all()
    for person, _group_name in group_rows:
        people.setdefault(person.id, person)
        fields = matched_in.setdefault(person.id, [])
        if "groups" not in fields:
            fields.append("groups")

    ordered = sorted(people.values(), key=lambda item: item.created_at)
    hydrate_people(db, ordered)
    return [{"person": person, "matched_in": matched_in.get(person.id, [])} for person in ordered]


def _search_memories(db: Session, user_id: uuid.UUID, keyword: str) -> list[dict[str, Any]]:
    pattern = f"%{keyword}%"
    rows = (
        db.execute(
            sa.select(Interaction)
            .options(selectinload(Interaction.attachments))
            .where(
                Interaction.user_id == user_id,
                Interaction.is_draft.is_(False),
                sa.or_(
                    Interaction.title.ilike(pattern),
                    Interaction.content.ilike(pattern),
                    Interaction.location.ilike(pattern),
                ),
            )
            .order_by(Interaction.interaction_date.desc())
            .limit(PER_SECTION_LIMIT)
        )
        .scalars()
        .unique()
        .all()
    )
    return [{"interaction": row, "person": _person_ref(row.person)} for row in rows]


def _search_commitments(db: Session, user_id: uuid.UUID, keyword: str) -> list[dict[str, Any]]:
    pattern = f"%{keyword}%"
    rows = (
        db.execute(
            sa.select(Commitment)
            .where(Commitment.user_id == user_id, Commitment.content.ilike(pattern))
            .order_by(Commitment.created_at.desc())
            .limit(PER_SECTION_LIMIT)
        )
        .scalars()
        .all()
    )
    return [{"commitment": row, "person": _person_ref(row.person)} for row in rows]


def _search_borrows(db: Session, user_id: uuid.UUID, keyword: str) -> list[dict[str, Any]]:
    pattern = f"%{keyword}%"
    rows = (
        db.execute(
            sa.select(BorrowRecord)
            .where(
                BorrowRecord.user_id == user_id,
                sa.or_(BorrowRecord.item_name.ilike(pattern), BorrowRecord.notes.ilike(pattern)),
            )
            .order_by(BorrowRecord.borrow_date.desc())
            .limit(PER_SECTION_LIMIT)
        )
        .scalars()
        .all()
    )
    return [{"borrow_record": row, "person": _person_ref(row.person)} for row in rows]


def search(db: Session, user_id: uuid.UUID, query: str) -> dict[str, Any]:
    """空查询或过短查询直接返回空结果（前端输入时不会闪烁无意义结论）。"""
    keyword = (query or "").strip()
    if len(keyword) < 1:
        return {
            "query": keyword,
            "people": [],
            "memories": [],
            "commitments": [],
            "borrow_records": [],
            "total": 0,
        }

    people = _search_people(db, user_id, keyword)
    memories = _search_memories(db, user_id, keyword)
    commitments = _search_commitments(db, user_id, keyword)
    borrows = _search_borrows(db, user_id, keyword)

    return {
        "query": keyword,
        "people": people,
        "memories": memories,
        "commitments": commitments,
        "borrow_records": borrows,
        "total": len(people) + len(memories) + len(commitments) + len(borrows),
    }


__all__ = ["PER_SECTION_LIMIT", "search"]
