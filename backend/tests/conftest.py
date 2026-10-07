"""pytest 公共设施（规范 §89）。

测试使用一个临时 SQLite 文件（不是 ``:memory:``，因为 TestClient 会在
多个线程里使用连接）。为了保证 ``DATABASE_URL`` 在 ``app.core.config``
被导入前就生效，这个文件在导入任何 ``app.*`` 模块之前先设置环境变量。

会话开始时写入一次 Demo 数据，之后每个用例前清空业务表，
让每个用例都从“有演示数据、但没有上一个用例的残留”开始。
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Generator, Iterator
from pathlib import Path

# --- 必须在导入 app.* 之前完成环境准备 -------------------------------------- #
_TMP_DIR = Path(tempfile.mkdtemp(prefix="orbit-tests-"))
_DB_PATH = _TMP_DIR / "orbit-test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH.as_posix()}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["UPLOAD_DIR"] = str(_TMP_DIR / "uploads")
os.environ["MAX_UPLOAD_MB"] = "1"
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_MODEL"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import seed as seed_module  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed_data import DEMO_USER  # noqa: E402

#: 清库顺序：先子表后父表，避免 SQLite 的外键校验报错。
_TABLE_ORDER = (
    "attachments",
    "person_updates",
    "important_dates",
    "preferences",
    "commitments",
    "borrow_records",
    "people_groups",
    "interactions",
    "people",
    "groups",
    "users",
)


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """整个测试会话共用一个 TestClient；应用自身的依赖注入照常工作。"""
    seed_module.seed(force=True)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_database(client: TestClient) -> Generator[None, None, None]:
    """每个用例前清空业务表，避免用例之间互相污染。"""
    from sqlalchemy import text

    with engine.begin() as connection:
        for table in _TABLE_ORDER:
            connection.execute(text(f"DELETE FROM {table}"))
    # 清库会把 Demo 账号一起删掉；规范 §6.4 要求它随时可用（一键体验），
    # 所以每个用例开始前重建一次 Demo 数据，用户隔离保证了它不会污染用例。
    seed_module.seed(force=True)
    yield


@pytest.fixture
def demo_payload() -> dict[str, str]:
    """演示账号的登录信息（§64）。"""
    return {"email": DEMO_USER["email"], "password": DEMO_USER["password"]}


@pytest.fixture
def demo_headers(client: TestClient, demo_payload: dict[str, str]) -> dict[str, str]:
    """演示账号的 Authorization 头；测试里最常用的那个人。"""
    response = client.post("/api/auth/login", json=demo_payload)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    """一个全新注册用户的 Authorization 头（用于隔离测试）。"""
    response = client.post(
        "/api/auth/register",
        json={"nickname": "测试用户", "email": "tester@orbit.local", "password": "orbit1234"},
    )
    assert response.status_code in (200, 201), response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def other_headers(client: TestClient) -> dict[str, str]:
    """第二个独立用户，用来验证用户隔离（§86）。"""
    response = client.post(
        "/api/auth/register",
        json={"nickname": "另一个人", "email": "other@orbit.local", "password": "orbit1234"},
    )
    assert response.status_code in (200, 201), response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def seeded_headers(client: TestClient, demo_payload: dict[str, str]) -> dict[str, str]:
    """重新灌一次 Demo 数据后再登录，供 today / search / ai 用例使用。"""
    seed_module.seed(force=True)
    response = client.post("/api/auth/login", json=demo_payload)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}
