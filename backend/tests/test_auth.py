"""鉴权测试（规范 §6.4 / §45 / §89）。

覆盖：注册、登录、``/me``、演示账号一键进入、退出、删除账户。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

NEW_USER = {"nickname": "新朋友", "email": "newbie@orbit.local", "password": "orbit1234"}


def test_register_returns_session_and_user(client: TestClient) -> None:
    response = client.post("/api/auth/register", json=NEW_USER)
    assert response.status_code in (200, 201), response.text

    payload = response.json()
    assert payload["tokenType"] == "bearer"
    assert payload["accessToken"]
    assert payload["user"]["email"] == NEW_USER["email"]
    assert payload["user"]["nickname"] == NEW_USER["nickname"]
    assert payload["user"]["avatarUrl"] is None
    # 密码绝不回传。
    assert "password" not in payload["user"]
    assert "passwordHash" not in payload["user"]


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    client.post("/api/auth/register", json=NEW_USER)
    again = client.post("/api/auth/register", json=NEW_USER)
    assert again.status_code == 409
    assert again.json()["detail"]


def test_login_then_me(client: TestClient) -> None:
    client.post("/api/auth/register", json=NEW_USER)

    login = client.post("/api/auth/login", json={"email": NEW_USER["email"], "password": NEW_USER["password"]})
    assert login.status_code == 200
    token = login.json()["accessToken"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == NEW_USER["email"]


def test_login_with_wrong_password_is_401(client: TestClient) -> None:
    client.post("/api/auth/register", json=NEW_USER)
    bad = client.post("/api/auth/login", json={"email": NEW_USER["email"], "password": "wrong-password"})
    assert bad.status_code == 401


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_demo_login(client: TestClient, demo_payload: dict[str, str]) -> None:
    """§6.4：``POST /api/auth/demo`` 不需要请求体，直接给演示会话。"""
    response = client.post("/api/auth/demo")
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["user"]["email"] == demo_payload["email"]
    assert payload["user"]["nickname"] == "林默"

    headers = {"Authorization": f"Bearer {payload['accessToken']}"}
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200


def test_logout_is_idempotent(client: TestClient, auth_headers: dict[str, str]) -> None:
    assert client.post("/api/auth/logout", headers=auth_headers).status_code == 204
    # 无状态 JWT：服务端不维护会话，token 仍然可用，直到客户端丢弃它。
    assert client.get("/api/auth/me", headers=auth_headers).status_code == 200


def test_delete_account_removes_everything(client: TestClient) -> None:
    """§36.3：删除账户需要确认，删除后数据一律不可见。"""
    registered = client.post("/api/auth/register", json=NEW_USER).json()
    headers = {"Authorization": f"Bearer {registered['accessToken']}"}

    created = client.post("/api/people", json={"name": "要被删掉的人"}, headers=headers)
    assert created.status_code in (200, 201), created.text

    assert client.delete("/api/auth/account", headers=headers).status_code == 400
    assert client.delete("/api/auth/account?confirm=true", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert (
        client.post("/api/auth/login", json={"email": NEW_USER["email"], "password": NEW_USER["password"]}).status_code
        == 401
    )
