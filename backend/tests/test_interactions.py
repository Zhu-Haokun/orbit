"""互动测试（规范 §27 时间轴 / §44 / §45 / §59 / §89）。

重点验证两件事：

* 日期归一化——只给 ``"2026-09-21"`` 也必须落成当天正午 UTC，
  这样在 UTC+8 回看还是同一天（§59）；
* 附件——``attachmentUrls`` 要真的产生 attachments 行（§44 / §57）。
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _person(client: TestClient, headers: dict[str, str], name: str = "林夕") -> dict:
    response = client.post("/api/people", json={"name": name}, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_create_interaction_normalizes_date(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)

    response = client.post(
        "/api/interactions",
        json={
            "personId": person["id"],
            "title": "一起吃火锅",
            "content": "她最近在准备教师资格证。",
            "interactionDate": "2026-09-21",
            "location": "学校旁边的火锅店",
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201), response.text

    body = response.json()
    # 正午 UTC：在任何合理时区回看都是同一天。
    assert body["interactionDate"].startswith("2026-09-21T12:00:00")
    assert body["interactionDate"].endswith("Z")
    assert body["source"] == "manual"
    assert body["location"] == "学校旁边的火锅店"
    assert body["attachments"] == []


def test_create_interaction_with_attachments(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)

    response = client.post(
        "/api/interactions",
        json={
            "personId": person["id"],
            "title": "摄影社秋季活动",
            "content": "拍了很多照片。",
            "interactionDate": "2026-08-30T08:30:00+08:00",
            "attachmentUrls": ["/uploads/a.jpg", "/uploads/b.png"],
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201), response.text

    body = response.json()
    assert len(body["attachments"]) == 2
    assert {item["fileType"] for item in body["attachments"]} == {"image"}
    assert {item["fileUrl"] for item in body["attachments"]} == {"/uploads/a.jpg", "/uploads/b.png"}
    # 带时区的时间也要归一到同一天的正午。
    assert body["interactionDate"].startswith("2026-08-30T12:00:00")


def test_create_interaction_for_unknown_person_is_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/interactions",
        json={
            "personId": "0b6d2c1a-0000-4000-8000-000000000001",
            "title": "不存在的人",
            "content": "",
            "interactionDate": "2026-09-21",
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_timeline_is_newest_first(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    for title, day in (("最早", "2025-03-01"), ("最新", "2026-09-21"), ("中间", "2026-01-15")):
        client.post(
            "/api/interactions",
            json={"personId": person["id"], "title": title, "content": "", "interactionDate": day},
            headers=auth_headers,
        )

    timeline = client.get(f"/api/people/{person['id']}/interactions", headers=auth_headers).json()
    assert [item["title"] for item in timeline] == ["最新", "中间", "最早"]


def test_patch_and_delete_interaction(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    created = client.post(
        "/api/interactions",
        json={
            "personId": person["id"],
            "title": "一起吃火锅",
            "content": "旧内容",
            "interactionDate": "2026-09-21",
            "attachmentUrls": ["/uploads/old.jpg"],
        },
        headers=auth_headers,
    ).json()

    patched = client.patch(
        f"/api/interactions/{created['id']}",
        json={
            "title": "一起吃烤肉",
            "content": "新内容",
            "interactionDate": "2026-10-01",
            "attachmentUrls": ["/uploads/new.jpg"],
            "source": "ai_parsed",
        },
        headers=auth_headers,
    )
    assert patched.status_code == 200, patched.text

    body = patched.json()
    assert body["title"] == "一起吃烤肉"
    assert body["content"] == "新内容"
    assert body["source"] == "ai_parsed"
    assert body["interactionDate"].startswith("2026-10-01T12:00:00")
    # 附件是替换而不是追加。
    assert [item["fileUrl"] for item in body["attachments"]] == ["/uploads/new.jpg"]

    # 只改标题时，附件与日期都保持原样。
    only_title = client.patch(
        f"/api/interactions/{created['id']}", json={"title": "又改了一次"}, headers=auth_headers
    ).json()
    assert only_title["interactionDate"].startswith("2026-10-01T12:00:00")
    assert len(only_title["attachments"]) == 1

    assert client.delete(f"/api/interactions/{created['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/people/{person['id']}/interactions", headers=auth_headers).json() == []


def test_interaction_updates_person_summary(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§69 Stage 3 验收：新增一条互动后，人物详情立刻反映出来。"""
    person = _person(client, auth_headers)
    assert person["interactionCount"] == 0

    client.post(
        "/api/interactions",
        json={"personId": person["id"], "title": "一起喝咖啡", "content": "", "interactionDate": "2026-10-04"},
        headers=auth_headers,
    )

    detail = client.get(f"/api/people/{person['id']}", headers=auth_headers).json()
    assert detail["interactionCount"] == 1
    assert detail["lastInteractionAt"].startswith("2026-10-04")
    assert detail["interactions"][0]["title"] == "一起喝咖啡"
