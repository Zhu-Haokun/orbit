"""鉴权路由（规范 §6.4 / §45 Auth）。

* ``POST /api/auth/register`` 注册即登录
* ``POST /api/auth/login`` 邮箱 + 密码
* ``POST /api/auth/demo`` 一键进入演示账号（前端「体验 Demo」按钮）
* ``POST /api/auth/logout`` 无状态 JWT，客户端丢弃 token 即可
* ``GET  /api/auth/me`` 当前用户
* ``DELETE /api/auth/account`` 删除账户与全部数据（§36.3）
"""

from __future__ import annotations

import logging
import uuid

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.group import Group
from app.models.interaction import Interaction
from app.models.person import Person
from app.models.user import User
from app.schemas.auth import AuthSession, LoginInput, RegisterInput, UserRead
from app.services.person_service import purge_person_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

#: 演示账号（规范 §6.4 / §47 / §64）。
DEMO_EMAIL = "demo@orbit.local"
DEMO_PASSWORD = "orbitdemo"
DEMO_NICKNAME = "林默"

_ACCOUNT_EXISTS = "这个邮箱已经注册过了，换一个或直接登录。"
_BAD_CREDENTIALS = "邮箱或密码不太对，再试一次。"
_DEMO_MISSING = "演示数据还没有准备好，先运行一次 python -m app.seed。"
_DELETE_CONFIRM = "删除账户需要明确确认，这一步不可撤销。"


def _session_for(user: User) -> AuthSession:
    return AuthSession(
        access_token=create_access_token(str(user.id)),
        token_type="bearer",
        user=UserRead.model_validate(user),
    )


def _normalized_email(value: str) -> str:
    return value.strip().lower()


def _find_by_email(db: Session, email: str) -> User | None:
    return db.execute(sa.select(User).where(User.email == email)).scalars().first()


@router.post("/register", response_model=AuthSession, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterInput, db: DbSession) -> AuthSession:
    """创建账号并直接返回会话，省掉一次登录。"""
    email = _normalized_email(payload.email)
    if _find_by_email(db, email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_ACCOUNT_EXISTS)

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        nickname=payload.nickname.strip(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # 并发注册同一个邮箱
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_ACCOUNT_EXISTS) from None
    db.refresh(user)
    return _session_for(user)


@router.post("/login", response_model=AuthSession)
def login(payload: LoginInput, db: DbSession) -> AuthSession:
    """邮箱 + 密码登录。失败时只给一条温和的提示，不区分是哪一项错了。"""
    user = _find_by_email(db, _normalized_email(payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_BAD_CREDENTIALS)
    return _session_for(user)


@router.post("/demo", response_model=AuthSession)
def demo_login(db: DbSession) -> AuthSession:
    """一键进入演示账号；不需要请求体。"""
    user = _find_by_email(db, DEMO_EMAIL)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_DEMO_MISSING)
    return _session_for(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_current_user: CurrentUser) -> Response:
    """JWT 无状态，服务端只需确认身份；客户端负责丢弃 token。"""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead)
def read_me(current_user: CurrentUser) -> User:
    return current_user


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    db: DbSession,
    current_user: CurrentUser,
    confirm: bool = False,
) -> Response:
    """删除账户与其全部数据（§36.3 需要二次确认）。"""
    if not confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_DELETE_CONFIRM)

    user_id: uuid.UUID = current_user.id
    person_ids = list(db.execute(sa.select(Person.id).where(Person.user_id == user_id)).scalars().all())

    purge_person_data(db, person_ids)
    db.execute(sa.delete(Interaction).where(Interaction.user_id == user_id))
    db.execute(sa.delete(Commitment).where(Commitment.user_id == user_id))
    db.execute(sa.delete(BorrowRecord).where(BorrowRecord.user_id == user_id))
    db.execute(sa.delete(Group).where(Group.user_id == user_id))
    db.execute(sa.delete(Person).where(Person.user_id == user_id))
    db.execute(sa.delete(User).where(User.id == user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
