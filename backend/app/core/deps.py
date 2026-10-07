"""FastAPI 依赖：当前用户与“属于我的某个人”（规范 §86 用户隔离）。

隔离规则（被 §86 明确要求、也被 tests/test_isolation.py 覆盖）：

* 任何依赖登录的资源都要求合法 Bearer token，否则 401。
* 人物及其子资源一律先确认 ``person.user_id == current_user.id``；
  不是自己的就返回 **404**，绝不返回 403 泄露“这条记录存在”。
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.interaction import Interaction
from app.models.person import Person
from app.models.user import User

# auto_error=False 让我们自己给出中文 detail（规范 §53 语气）。
bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token")

DbSession = Annotated[Session, Depends(get_db)]

_UNAUTHORIZED = "登录状态已过期，请重新登录。"


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    """Resolve the authenticated user, or raise 401 with calm Chinese copy."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_UNAUTHORIZED)

    subject = decode_access_token(credentials.credentials)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_UNAUTHORIZED)

    try:
        user_id = uuid.UUID(subject)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_UNAUTHORIZED) from None

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_UNAUTHORIZED)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]

#: 找不到、或不属于当前用户时统一使用这条文案。
NOT_FOUND_PERSON = "没有找到这个人的记录。"


def get_owned_person(person_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> Person:
    """Load a person owned by the current user; 404 for anyone else's person."""
    person = db.get(Person, person_id)
    if person is None or person.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_PERSON)
    return person


OwnedPerson = Annotated[Person, Depends(get_owned_person)]


#: 找不到、或不属于当前用户时统一使用这条文案。
NOT_FOUND_INTERACTION = "没有找到这条记录。"


def get_owned_interaction(
    interaction_id: uuid.UUID, db: DbSession, current_user: CurrentUser
) -> Interaction:
    """Load an interaction owned by the current user; 404 otherwise."""
    interaction = db.get(Interaction, interaction_id)
    if interaction is None or interaction.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_INTERACTION)
    return interaction


OwnedInteraction = Annotated[Interaction, Depends(get_owned_interaction)]
