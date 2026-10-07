"""§30「全部保存」——把一次解析结果落成一个原子事务（规范 §30 / §70 步骤 9–11）。

规则：

* 一次请求 = 一个事务，全成或全不成：任何一条子记录出错，整次保存回滚。
* 先写互动，再把所有子记录的 ``source_interaction_id`` 指向它，
  这样“这条近况来自哪一天的记录”永远可追溯（§22 / §23）。
* 子记录只挂在这条互动对应的人身上；客户端的 ``personId`` 必须属于当前用户，
  否则 404（不泄露别人是否存在，§86）。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session, selectinload

from app.models.attachment import Attachment
from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.enums import AttachmentFileType, BorrowStatus, InteractionSource
from app.models.important_date import ImportantDate
from app.models.interaction import Interaction, normalize_interaction_date
from app.models.person import Person
from app.models.person_update import PersonUpdate
from app.models.preference import Preference
from app.schemas.ai import CommitParseInput
from app.services.person_service import today_local, touch_person


class CommitError(Exception):
    """聚合保存时的业务错误；id 空缺由调用方翻译成 404。"""


def _resolve_person(db: Session, user_id: Any, person_id: Any) -> Person | None:
    person = db.get(Person, person_id)
    if person is None or person.user_id != user_id:
        return None
    return person


def _create_attachments(db: Session, interaction: Interaction, urls: list[str]) -> None:
    for url in urls:
        if not url:
            continue
        db.add(
            Attachment(
                interaction_id=interaction.id,
                file_type=AttachmentFileType.IMAGE,
                file_url=url,
            )
        )


def commit_parse(db: Session, user_id: Any, payload: CommitParseInput) -> dict[str, Any]:
    """保存解析结果，返回 ``CommitParseResult`` 需要的全部对象。"""
    person = _resolve_person(db, user_id, payload.interaction.person_id)
    if person is None:
        raise CommitError("没有找到这个人的记录。")

    # 顶部 attachmentUrls 与 interaction.attachmentUrls 合并去重（§57）。
    attachment_urls: list[str] = []
    for url in [*payload.attachment_urls, *payload.interaction.attachment_urls]:
        if url and url not in attachment_urls:
            attachment_urls.append(url)

    interaction: Interaction | None = None
    if payload.interaction_id is not None:
        # 「先记下来」之后再整理：更新原来那一条，避免存出两条重复记录。
        existing = db.execute(
            sa.select(Interaction).where(
                Interaction.id == payload.interaction_id,
                Interaction.user_id == user_id,
            )
        ).scalar_one_or_none()
        if existing is None:
            raise CommitError("没有找到要整理的那条记录。")
        interaction = existing
        interaction.person_id = person.id
        interaction.title = payload.interaction.title
        interaction.content = payload.interaction.content or ""
        interaction.interaction_date = normalize_interaction_date(
            payload.interaction.interaction_date
        )
        interaction.location = payload.interaction.location
        interaction.interaction_type = payload.interaction.interaction_type
        interaction.source = InteractionSource.AI_PARSED
        # 整理完成，这条不再是草稿：从此进入回忆 / 今天 / 搜索。
        interaction.is_draft = False
        # 附件在下面统一替换，先清掉旧的。
        db.execute(sa.delete(Attachment).where(Attachment.interaction_id == interaction.id))

    if interaction is None:
        interaction = Interaction(
            user_id=user_id,
            person_id=person.id,
            title=payload.interaction.title,
            content=payload.interaction.content or "",
            interaction_date=normalize_interaction_date(payload.interaction.interaction_date),
            location=payload.interaction.location,
            interaction_type=payload.interaction.interaction_type,
            # §30 的确认保存默认标记为 AI 整理过的记录。
            source=payload.interaction.source or InteractionSource.AI_PARSED,
        )
        db.add(interaction)

    db.flush()
    _create_attachments(db, interaction, attachment_urls)

    # 一起经历的人：这次共同回忆也要进他们的档案。
    # 结构化内容（近况 / 未完待续 / 重要日期……）只挂在主人物名下 ——
    # 那些通常是关于某一个人的，复制给所有人反而是错的。
    extra_people = [
        extra
        for extra in (db.get(Person, x) for x in payload.person_ids if x != person.id)
        if extra is not None and extra.user_id == user_id
    ]
    # 多人共享同一次经历 → 同一个 event_id，星图据此连出朋友之间的线。
    event_id = uuid.uuid4() if extra_people else None

    if event_id is not None:
        interaction.event_id = event_id

    for extra_person in extra_people:
        twin = Interaction(
            user_id=user_id,
            person_id=extra_person.id,
            title=payload.interaction.title,
            content=payload.interaction.content or "",
            interaction_date=normalize_interaction_date(payload.interaction.interaction_date),
            location=payload.interaction.location,
            interaction_type=payload.interaction.interaction_type,
            source=payload.interaction.source or InteractionSource.AI_PARSED,
            mood=payload.interaction.mood,
            event_id=event_id,
        )
        db.add(twin)
        db.flush()
        _create_attachments(db, twin, attachment_urls)
        touch_person(extra_person)

    updates = [
        PersonUpdate(
            person_id=person.id,
            content=item.content,
            source_interaction_id=interaction.id,
            status=item.status,
        )
        for item in payload.updates
    ]
    db.add_all(updates)

    commitments = [
        Commitment(
            user_id=user_id,
            person_id=person.id,
            content=item.content,
            due_date=item.due_date,
            due_text=item.due_text,
            source_interaction_id=interaction.id,
        )
        for item in payload.commitments
    ]
    db.add_all(commitments)

    important_dates = [
        ImportantDate(
            person_id=person.id,
            title=item.title,
            date=item.date,
            date_text=item.date_text,
            date_precision=item.date_precision,
            repeat_type=item.repeat_type,
        )
        for item in payload.important_dates
    ]
    db.add_all(important_dates)

    preferences = [
        Preference(
            person_id=person.id,
            category=item.category,
            content=item.content,
            source_interaction_id=interaction.id,
        )
        for item in payload.preferences
    ]
    db.add_all(preferences)

    borrow_records = [
        BorrowRecord(
            user_id=user_id,
            person_id=person.id,
            direction=item.direction,
            item_name=item.item_name,
            # 没写日期就落在这次互动的那一天，其次才是今天。
            borrow_date=item.borrow_date or interaction.interaction_date.date() or today_local(),
            status=BorrowStatus.OPEN,
        )
        for item in payload.borrow_records
    ]
    db.add_all(borrow_records)

    touch_person(person)
    db.commit()

    # 重新读回互动（含附件），保证响应里连服务端默认值都是最新的。
    fresh = db.execute(
        sa.select(Interaction).options(selectinload(Interaction.attachments)).where(Interaction.id == interaction.id)
    ).scalar_one()

    return {
        "interaction": fresh,
        "updates": updates,
        "commitments": commitments,
        "important_dates": important_dates,
        "preferences": preferences,
        "borrow_records": borrow_records,
    }


def now_utc() -> datetime:
    """小工具：确认保存后想打时间戳的地方统一用它。"""
    return datetime.now(UTC)


__all__ = ["CommitError", "commit_parse", "now_utc"]
