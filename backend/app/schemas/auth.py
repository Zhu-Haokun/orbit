"""Auth schema（``User`` / ``AuthSession`` / 注册登录入参，规范 §6.4 / §45）。"""

from __future__ import annotations

import uuid

from pydantic import Field

from app.schemas.common import CamelModel, EmailAddress, UtcDatetime


class UserRead(CamelModel):
    """公开的用户信息，永远不含 ``password_hash``。"""

    id: uuid.UUID
    email: str
    nickname: str
    avatar_url: str | None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class AuthSession(CamelModel):
    """登录 / 注册 / Demo 成功后返回的会话。"""

    access_token: str
    token_type: str = "bearer"
    user: UserRead


class RegisterInput(CamelModel):
    nickname: str = Field(min_length=1, max_length=60)
    email: EmailAddress
    password: str = Field(min_length=6, max_length=128)


class LoginInput(CamelModel):
    email: EmailAddress
    password: str = Field(min_length=1, max_length=128)
