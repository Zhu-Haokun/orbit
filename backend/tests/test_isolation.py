"""用户隔离测试（规范 §86，被明确要求自动测试）。

规则：别人的东西对你来说就是“不存在”——一律 404，绝不 403 泄露它的存在。
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _person_of(client: TestClient, headers: dict[str, str], name: str = "林夕") -> dict:
    response = client.post("/api/people", json={"name": name}, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_other_user_cannot_read_person(
    client: TestClient, auth_headers: dict[str, str], other_headers: dict[str, str]
) -> None:
    person = _person_of(client, auth_headers)

    listing = client.get("/api/people", headers=other_headers).json()
    assert listing == []
    assert client.get(f"/api/people/{person['id']}", headers=other_headers).status_code == 404


def test_other_user_cannot_patch_or_delete_person(
    client: TestClient, auth_headers: dict[str, str], other_headers: dict[str, str]
) -> None:
    person = _person_of(client, auth_headers)

    assert (
        client.patch(f"/api/people/{person['id']}", json={"name": "被改名了"}, headers=other_headers).status_code == 404
    )
    assert client.delete(f"/api/people/{person['id']}", headers=other_headers).status_code == 404

    # 原用户的数据完好无损。
    still_there = client.get(f"/api/people/{person['id']}", headers=auth_headers)
    assert still_there.status_code == 200
    assert still_there.json()["name"] == "林夕"


def test_other_user_cannot_touch_children(
    client: TestClient, auth_headers: dict[str, str], other_headers: dict[str, str]
) -> None:
    """子资源（互动 / 近况 / 未完待续 / 重要日期 / 偏好 / 借还）同样要隔离。"""
    person = _person_of(client, auth_headers)
    person_id = person["id"]
    victim = "1d9e4b1f-6a80-4d5b-9d1a-2b8d5f0f0a01"

    interaction = client.post(
        "/api/interactions",
        json={"personId": person_id, "title": "一起吃火锅", "content": "", "interactionDate": "2026-09-21"},
        headers=auth_headers,
    ).json()
    update = client.post(
        "/api/updates", json={"personId": person_id, "content": "准备教资"}, headers=auth_headers
    ).json()
    commitment = client.post(
        "/api/commitments", json={"personId": person_id, "content": "发照片"}, headers=auth_headers
    ).json()
    important = client.post(
        "/api/important-dates",
        json={"personId": person_id, "title": "生日", "date": "2026-11-12"},
        headers=auth_headers,
    ).json()
    preference = client.post(
        "/api/preferences",
        json={"personId": person_id, "category": "like", "content": "胶片摄影"},
        headers=auth_headers,
    ).json()
    borrow = client.post(
        "/api/borrow-records",
        json={"personId": person_id, "direction": "lent_to", "itemName": "50mm 镜头", "borrowDate": "2026-08-30"},
        headers=auth_headers,
    ).json()

    # 挂在别人人物下的列表：404，而不是空列表（那会暗示“这个人存在”）。
    assert client.get(f"/api/people/{person_id}/interactions", headers=other_headers).status_code == 404
    assert client.get(f"/api/people/{person_id}/updates", headers=other_headers).status_code == 404

    # 往别人的材料里写东西：404。
    assert (
        client.post(
            "/api/interactions",
            json={"personId": person_id, "title": "偷偷写一条", "content": "", "interactionDate": "2026-09-21"},
            headers=other_headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/updates", json={"personId": person_id, "content": "偷偷写"}, headers=other_headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/commitments", json={"personId": person_id, "content": "偷偷写"}, headers=other_headers
        ).status_code
        == 404
    )
    assert (
        client.post("/api/preferences", json={"personId": person_id, "content": "x"}, headers=other_headers).status_code
        == 404
    )
    assert (
        client.post(
            "/api/borrow-records",
            json={"personId": person_id, "itemName": "x", "borrowDate": "2026-08-30"},
            headers=other_headers,
        ).status_code
        == 404
    )
    assert client.get(f"/api/commitments?personId={person_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/important-dates?personId={person_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/preferences?personId={person_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/borrow-records?personId={person_id}", headers=other_headers).status_code == 404

    # 改动别人已有的行：404。
    assert (
        client.patch(f"/api/interactions/{interaction['id']}", json={"title": "改"}, headers=other_headers).status_code
        == 404
    )
    assert client.delete(f"/api/interactions/{interaction['id']}", headers=other_headers).status_code == 404
    assert (
        client.patch(f"/api/updates/{update['id']}", json={"content": "改"}, headers=other_headers).status_code == 404
    )
    assert client.delete(f"/api/updates/{update['id']}", headers=other_headers).status_code == 404
    assert (
        client.patch(f"/api/commitments/{commitment['id']}", json={"status": "done"}, headers=other_headers).status_code
        == 404
    )
    assert (
        client.patch(f"/api/important-dates/{important['id']}", json={"title": "改"}, headers=other_headers).status_code
        == 404
    )
    assert (
        client.patch(f"/api/preferences/{preference['id']}", json={"content": "改"}, headers=other_headers).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/borrow-records/{borrow['id']}", json={"status": "returned"}, headers=other_headers
        ).status_code
        == 404
    )

    # 别人的 token 也访问不到自己的东西（这里用的是不存在 / 别人的 id）。
    assert client.get(f"/api/people/{victim}", headers=auth_headers).status_code == 404

    # 原数据保持不变。
    assert client.get(f"/api/people/{person_id}", headers=auth_headers).json()["interactionCount"] == 1


def test_other_user_cannot_use_someone_elses_group(
    client: TestClient, auth_headers: dict[str, str], other_headers: dict[str, str]
) -> None:
    """别人的 groupId 不能塞进自己的联系人，否则等于间接读到别人的星系。"""
    group = client.post("/api/groups", json={"name": "摄影社"}, headers=auth_headers).json()

    created = client.post("/api/people", json={"name": "林夕", "groupIds": [group["id"]]}, headers=other_headers)
    assert created.status_code == 404

    # 也不允许改别人的星系。
    assert client.patch(f"/api/groups/{group['id']}", json={"name": "改"}, headers=other_headers).status_code == 404
    assert client.delete(f"/api/groups/{group['id']}", headers=other_headers).status_code == 404
    assert client.get("/api/groups", headers=other_headers).json() == []


def test_search_and_aggregates_are_scoped(
    client: TestClient, auth_headers: dict[str, str], other_headers: dict[str, str]
) -> None:
    person = _person_of(client, auth_headers, name="只在第一个人那里的名字")
    client.post(
        "/api/interactions",
        json={
            "personId": person["id"],
            "title": "独特的记忆标题",
            "content": "内容",
            "interactionDate": "2026-09-21",
        },
        headers=auth_headers,
    )

    results = client.get("/api/search?q=独特的记忆标题", headers=other_headers).json()
    assert results["total"] == 0
    assert results["memories"] == []

    today = client.get("/api/today", headers=other_headers).json()
    assert today["commitments"] == []
    assert today["memoryPrompts"] == []

    memories = client.get("/api/memories", headers=other_headers).json()
    assert memories["months"] == []
    assert memories["summary"]["interactionCount"] == 0

    exported = client.get("/api/export/json", headers=other_headers).json()
    assert exported["people"] == []
    assert exported["interactions"] == []
