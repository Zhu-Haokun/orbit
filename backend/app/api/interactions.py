"""互动路由（规范 §27 时间轴 / §28 记录 / §30 确认保存 / §45 Interactions）。

包含三类入口：

* ``GET  /api/people/{id}/interactions`` —— 某人的时间轴
* ``POST /api/interactions`` / ``PATCH`` / ``DELETE`` —— 单条记录的增改删
* ``POST /api/interactions/commit`` —— 解析结果的原子保存（§30「全部保存」）
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, DbSession, OwnedPerson
from app.models.attachment import Attachment
from app.models.enums import AttachmentFileType, InteractionSource
from app.models.interaction import Interaction, normalize_interaction_date
from app.models.person import Person
from app.schemas.ai import CommitParseInput, CommitParseResult
from app.schemas.interaction import InteractionInput, InteractionPatch, InteractionRead
from app.services import commit_service, person_service

router = APIRouter(prefix="/api", tags=["interactions"])

_MISSING_TITLE = "给这次记录写一个短短的标题吧。"


def _load_interaction(db: Session, user_id: uuid.UUID, interaction_id: uuid.UUID) -> Interaction:
    interaction = db.execute(
        sa.select(Interaction).options(selectinload(Interaction.attachments)).where(Interaction.id == interaction_id)
    ).scalar_one_or_none()
    if interaction is None or interaction.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="没有找到这条记录。")
    return interaction


def _replace_attachments(db: Session, interaction: Interaction, urls: list[str]) -> None:
    db.execute(sa.delete(Attachment).where(Attachment.interaction_id == interaction.id))
    for url in urls:
        if url:
            db.add(
                Attachment(
                    interaction_id=interaction.id,
                    file_type=AttachmentFileType.IMAGE,
                    file_url=url,
                )
            )
    # 上面走的是 Core 删除，ORM 已经加载的集合不会自动失效（session 是
    # expire_on_commit=False），不显式过期的话，重载会拿回旧附件。
    db.expire(interaction, ["attachments"])


@router.get("/people/{person_id}/interactions", response_model=list[InteractionRead])
def list_interactions(db: DbSession, person: OwnedPerson) -> list[Interaction]:
    """某人的时间轴，最新在前（§27）。"""
    return (
        db.execute(
            sa.select(Interaction)
            .options(selectinload(Interaction.attachments))
            .where(Interaction.person_id == person.id, Interaction.user_id == person.user_id)
            .order_by(Interaction.interaction_date.desc(), Interaction.created_at.desc())
        )
        .scalars()
        .unique()
        .all()
    )


@router.post("/interactions", response_model=InteractionRead, status_code=status.HTTP_201_CREATED)
def create_interaction(payload: InteractionInput, db: DbSession, current_user: CurrentUser) -> Interaction:
    """记录一次互动；``attachmentUrls`` 会落成 attachments 行。

    传了多个 ``personIds`` 时（"和好几个人一起"），为每个人各建一条 ——
    每个人的时间轴因此都是完整的，也不用引入多对多关系表。
    响应仍然返回第一条，保持接口契约不变（多人的情况前端只关心成功与否）。
    """
    targets = [payload.person_id, *[pid for pid in payload.person_ids if pid != payload.person_id]]
    people: list[Person] = []
    for person_id in targets:
        person = db.get(Person, person_id)
        if person is None or person.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="没有找到这个人的记录。")
        people.append(person)

    created: list[Interaction] = []
    # 一次共同经历的所有互动共享 event_id：星图据此判断"这两个人真的同框过"。
    event_id = uuid.uuid4() if len(people) > 1 else None
    for person in people:
        interaction = Interaction(
            user_id=current_user.id,
            person_id=person.id,
            title=payload.title.strip() or _MISSING_TITLE,
            content=payload.content or "",
            interaction_date=normalize_interaction_date(payload.interaction_date),
            location=payload.location,
            interaction_type=payload.interaction_type,
            source=payload.source or InteractionSource.MANUAL,
            mood=payload.mood,
            is_draft=payload.is_draft,
            event_id=event_id,
        )
        db.add(interaction)
        db.flush()
        _replace_attachments(db, interaction, list(dict.fromkeys(payload.attachment_urls)))
        person_service.touch_person(person)
        created.append(interaction)

    interaction = created[0]
    db.commit()
    return _load_interaction(db, current_user.id, interaction.id)


@router.post("/interactions/commit", response_model=CommitParseResult)
def commit_parse(payload: CommitParseInput, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    """§30「全部保存」：一次事务写入互动与全部子记录，全成或全不成。"""
    try:
        return commit_service.commit_parse(db, current_user.id, payload)
    except commit_service.CommitError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.patch("/interactions/{interaction_id}", response_model=InteractionRead)
def update_interaction(
    interaction_id: uuid.UUID,
    payload: InteractionPatch,
    db: DbSession,
    current_user: CurrentUser,
) -> Interaction:
    interaction = _load_interaction(db, current_user.id, interaction_id)
    # 用 ``exclude_unset`` 判断客户端到底提供了哪些字段：它按“字段名”返回，
    # 不受 camelCase 别名影响，比直接看 ``model_fields_set`` 稳。
    provided = payload.model_dump(exclude_unset=True, by_alias=False)
    changes = {key: value for key, value in provided.items() if key != "attachment_urls"}

    if "title" in changes and changes["title"] is not None:
        changes["title"] = str(changes["title"]).strip()
        if not changes["title"]:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_MISSING_TITLE)
    if "interaction_date" in changes and changes["interaction_date"] is not None:
        changes["interaction_date"] = normalize_interaction_date(changes["interaction_date"])

    for field, value in changes.items():
        setattr(interaction, field, value)

    if "attachment_urls" in provided and payload.attachment_urls is not None:
        _replace_attachments(db, interaction, list(dict.fromkeys(payload.attachment_urls)))

    person = db.get(Person, interaction.person_id)
    if person is not None:
        person_service.touch_person(person)
    db.commit()
    return _load_interaction(db, current_user.id, interaction.id)


@router.get("/interactions/drafts", response_model=list[InteractionRead])
def list_drafts(db: DbSession, current_user: CurrentUser) -> list[Interaction]:
    """还没整理的「先记下来」。

    放在服务端而不是前端 state，这样离开记录页、刷新、换设备之后
    这份"待整理"清单仍然在，直到用户整理或删除它。
    """
    return list(
        db.execute(
            sa.select(Interaction)
            .options(selectinload(Interaction.attachments))
            .where(Interaction.user_id == current_user.id, Interaction.is_draft.is_(True))
            .order_by(Interaction.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.delete("/interactions/{interaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interaction(interaction_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Response:
    interaction = _load_interaction(db, current_user.id, interaction_id)
    db.execute(sa.delete(Attachment).where(Attachment.interaction_id == interaction.id))
    db.delete(interaction)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
