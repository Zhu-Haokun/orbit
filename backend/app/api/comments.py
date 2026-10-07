"""回忆评论（``/api/interactions/{id}/comments``）。

回看一段旧记忆时留下的几句话。刻意做成互动下面的附属资源，
而不是往互动里塞字段 —— 评论有自己的时间，也不该改动原始记录。
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser, DbSession, OwnedInteraction
from app.models.memory_comment import MemoryComment
from app.schemas.memory_comment import MemoryCommentInput, MemoryCommentPatch, MemoryCommentRead

router = APIRouter(prefix="/api/interactions/{interaction_id}/comments", tags=["comments"])

_NOT_FOUND = "没有找到这条评论。"


def _load_owned(db: DbSession, user_id, interaction_id: uuid.UUID, comment_id: uuid.UUID) -> MemoryComment:
    comment = db.execute(
        sa.select(MemoryComment).where(
            MemoryComment.id == comment_id,
            MemoryComment.user_id == user_id,
            MemoryComment.interaction_id == interaction_id,
        )
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return comment


@router.get("", response_model=list[MemoryCommentRead])
def list_comments(
    interaction: OwnedInteraction, db: DbSession, current_user: CurrentUser
) -> list[MemoryComment]:
    """按时间正序列出这条互动的评论。"""
    return list(
        db.execute(
            sa.select(MemoryComment)
            .where(MemoryComment.interaction_id == interaction.id)
            .order_by(MemoryComment.created_at.asc())
        )
        .scalars()
        .all()
    )


@router.post("", response_model=MemoryCommentRead, status_code=status.HTTP_201_CREATED)
def create_comment(
    payload: MemoryCommentInput,
    interaction: OwnedInteraction,
    db: DbSession,
    current_user: CurrentUser,
) -> MemoryComment:
    content = payload.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="写一句想说的话吧。"
        )
    comment = MemoryComment(
        user_id=current_user.id,
        interaction_id=interaction.id,
        content=content,
        emoji=payload.emoji,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.patch("/{comment_id}", response_model=MemoryCommentRead)
def update_comment(
    comment_id: uuid.UUID,
    payload: MemoryCommentPatch,
    interaction: OwnedInteraction,
    db: DbSession,
    current_user: CurrentUser,
) -> MemoryComment:
    comment = _load_owned(db, current_user.id, interaction.id, comment_id)
    data = payload.model_dump(exclude_unset=True)
    if "content" in data and data["content"] is not None:
        data["content"] = str(data["content"]).strip() or comment.content
    for key, value in data.items():
        setattr(comment, key, value)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: uuid.UUID,
    interaction: OwnedInteraction,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    comment = _load_owned(db, current_user.id, interaction.id, comment_id)
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
