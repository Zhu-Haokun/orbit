"""导出服务（规范 §36.2 / §88）——“把属于你的东西还给你”。

JSON 导出必须完整：用户 + 人物 + 星系 + 互动 + 未完待续 + 重要日期 + 偏好 + 借还。
CSV 走的是“一条互动一行”的扁平格式，方便用户扔进表格里看。
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session, selectinload

from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.group import Group, people_groups
from app.models.important_date import ImportantDate
from app.models.interaction import Interaction
from app.models.person import Person
from app.models.preference import Preference
from app.models.user import User
from app.services.person_service import hydrate_people

#: CSV 表头固定，方便用户二次处理。
CSV_COLUMNS = (
    "person_name",
    "relationship_label",
    "interaction_date",
    "title",
    "content",
    "location",
    "interaction_type",
    "source",
    "attachment_count",
)


def _group_person_counts(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = db.execute(
        sa.select(people_groups.c.group_id, sa.func.count(people_groups.c.person_id))
        .join(Person, Person.id == people_groups.c.person_id)
        .where(Person.user_id == user_id)
        .group_by(people_groups.c.group_id)
    ).all()
    return {group_id: int(count) for group_id, count in rows}


def build_export(db: Session, user: User) -> dict[str, Any]:
    """组装 ``ExportPayload``。"""
    people = list(
        db.execute(sa.select(Person).where(Person.user_id == user.id).order_by(Person.created_at.asc()))
        .scalars()
        .unique()
        .all()
    )
    hydrate_people(db, people)

    groups = list(
        db.execute(sa.select(Group).where(Group.user_id == user.id).order_by(Group.sort_order.asc())).scalars().all()
    )
    counts = _group_person_counts(db, user.id)
    for group in groups:
        group.person_count = counts.get(group.id, 0)

    interactions = list(
        db.execute(
            sa.select(Interaction)
            .options(selectinload(Interaction.attachments))
            .where(Interaction.user_id == user.id)
            .order_by(Interaction.interaction_date.desc())
        )
        .scalars()
        .unique()
        .all()
    )
    commitments = list(
        db.execute(sa.select(Commitment).where(Commitment.user_id == user.id).order_by(Commitment.created_at.desc()))
        .scalars()
        .all()
    )
    borrow_records = list(
        db.execute(
            sa.select(BorrowRecord).where(BorrowRecord.user_id == user.id).order_by(BorrowRecord.borrow_date.desc())
        )
        .scalars()
        .all()
    )

    person_ids = [person.id for person in people]
    important_dates = (
        list(
            db.execute(
                sa.select(ImportantDate)
                .where(ImportantDate.person_id.in_(person_ids))
                .order_by(ImportantDate.date.asc())
            )
            .scalars()
            .all()
        )
        if person_ids
        else []
    )
    preferences = (
        list(
            db.execute(
                sa.select(Preference).where(Preference.person_id.in_(person_ids)).order_by(Preference.created_at.asc())
            )
            .scalars()
            .all()
        )
        if person_ids
        else []
    )

    return {
        "exported_at": datetime.now(UTC),
        "user": user,
        "people": people,
        "groups": groups,
        "interactions": interactions,
        "commitments": commitments,
        "important_dates": important_dates,
        "preferences": preferences,
        "borrow_records": borrow_records,
    }


def build_csv(db: Session, user: User) -> str:
    """一条互动一行，含人物姓名；UTF-8 BOM 让 Excel 正确识别中文。"""
    rows = (
        db.execute(
            sa.select(Interaction, Person)
            .join(Person, Person.id == Interaction.person_id)
            .options(selectinload(Interaction.attachments))
            .where(Interaction.user_id == user.id)
            .order_by(Interaction.interaction_date.desc())
        )
        .unique()
        .all()
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for interaction, person in rows:
        writer.writerow(
            [
                person.name,
                person.relationship_label or "",
                interaction.interaction_date.date().isoformat(),
                interaction.title,
                interaction.content,
                interaction.location or "",
                interaction.interaction_type or "",
                interaction.source.value if hasattr(interaction.source, "value") else interaction.source,
                len(interaction.attachments),
            ]
        )
    return buffer.getvalue()


__all__ = ["CSV_COLUMNS", "build_csv", "build_export"]
