"""人物 CRUD 与派生字段测试（规范 §20 / §21 / §44 / §45 / §89）。"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.services.person_service import today_local


def _create_person(client: TestClient, headers: dict[str, str], **overrides: object) -> dict:
    payload = {"name": "林夕", "relationshipLabel": "大学朋友", "circleLevel": "frequent"}
    payload.update(overrides)
    response = client.post("/api/people", json=payload, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_create_person_defaults(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _create_person(client, auth_headers)

    assert person["name"] == "林夕"
    assert person["relationshipLabel"] == "大学朋友"
    assert person["circleLevel"] == "frequent"
    assert person["nickname"] is None
    assert person["metAt"] is None
    assert person["groups"] == []
    # 派生字段在没有记录时必须是安全的零值。
    assert person["interactionCount"] == 0
    assert person["lastInteractionAt"] is None
    assert person["latestUpdate"] is None
    assert person["openCommitmentCount"] == 0
    assert person["nextImportantDate"] is None
    assert person["updates"] == []
    assert person["interactions"] == []


def test_create_person_requires_name(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post("/api/people", json={"name": ""}, headers=auth_headers)
    assert response.status_code == 422


def test_group_membership_is_replaced_not_appended(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§44：``groupIds`` 是完整替换语义。"""
    group_a = client.post("/api/groups", json={"name": "宿舍"}, headers=auth_headers).json()
    group_b = client.post("/api/groups", json={"name": "摄影社"}, headers=auth_headers).json()

    person = _create_person(client, auth_headers, groupIds=[group_a["id"]])
    assert [item["name"] for item in person["groups"]] == ["宿舍"]

    patched = client.patch(f"/api/people/{person['id']}", json={"groupIds": [group_b["id"]]}, headers=auth_headers)
    assert patched.status_code == 200, patched.text
    assert [item["name"] for item in patched.json()["groups"]] == ["摄影社"]


def test_derived_fields_after_records(client: TestClient, auth_headers: dict[str, str]) -> None:
    """派生字段：最近互动、记录条数、最近近况、未完成数量、下一个重要日期。"""
    person = _create_person(client, auth_headers)
    person_id = person["id"]

    first = client.post(
        "/api/interactions",
        json={
            "personId": person_id,
            "title": "一起吃火锅",
            "content": "她最近在准备教师资格证。",
            "interactionDate": "2026-09-21",
        },
        headers=auth_headers,
    )
    assert first.status_code in (200, 201), first.text

    second = client.post(
        "/api/interactions",
        json={
            "personId": person_id,
            "title": "参加摄影社秋季活动",
            "content": "她借走了我的 50mm 镜头。",
            "interactionDate": "2026-08-30",
        },
        headers=auth_headers,
    )
    assert second.status_code in (200, 201), second.text

    client.post(
        "/api/updates",
        json={"personId": person_id, "content": "准备教师资格证"},
        headers=auth_headers,
    )
    client.post(
        "/api/updates",
        json={"personId": person_id, "content": "已经归档的近况", "status": "archived"},
        headers=auth_headers,
    )
    client.post(
        "/api/commitments",
        json={"personId": person_id, "content": "把照片发给她"},
        headers=auth_headers,
    )
    client.post(
        "/api/commitments",
        json={"personId": person_id, "content": "已经完成的事", "status": "done"},
        headers=auth_headers,
    )

    soon = today_local() + timedelta(days=5)
    client.post(
        "/api/important-dates",
        json={"personId": person_id, "title": "比赛答辩", "date": soon.isoformat()},
        headers=auth_headers,
    )
    later = today_local() + timedelta(days=400)
    client.post(
        "/api/important-dates",
        json={"personId": person_id, "title": "很久以后", "date": later.isoformat()},
        headers=auth_headers,
    )

    detail = client.get(f"/api/people/{person_id}", headers=auth_headers).json()

    assert detail["interactionCount"] == 2
    # 互动时间被归一到当天正午 UTC，所以日期部分是稳定的。
    assert detail["lastInteractionAt"].startswith("2026-09-21")
    assert detail["latestUpdate"] == "准备教师资格证"
    assert detail["openCommitmentCount"] == 1
    assert detail["nextImportantDate"]["title"] == "比赛答辩"
    assert detail["nextImportantDate"]["date"] == soon.isoformat()
    assert detail["nextImportantDate"]["datePrecision"] == "exact"
    assert [item["title"] for item in detail["interactions"]] == ["一起吃火锅", "参加摄影社秋季活动"]


def test_next_important_date_rolls_yearly_birthday_forward(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§24 / §50：生日是 ``yearly``，过去的年份要滚到今年或明年。"""
    person = _create_person(client, auth_headers)
    birthday = date(2020, 1, 3)  # 一个肯定已经过去的年份

    client.post(
        "/api/important-dates",
        json={
            "personId": person["id"],
            "title": "生日",
            "date": birthday.isoformat(),
            "repeatType": "yearly",
        },
        headers=auth_headers,
    )

    detail = client.get(f"/api/people/{person['id']}", headers=auth_headers).json()
    upcoming = detail["nextImportantDate"]
    assert upcoming is not None
    assert upcoming["repeatType"] == "yearly"
    # 下一个生日必然在今天或以后，且与今天相差不超过一年。
    assert date.fromisoformat(upcoming["date"]) >= today_local()
    assert date.fromisoformat(upcoming["date"]) <= today_local() + timedelta(days=366)


def test_month_precision_is_comparable(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§24：``month`` 精度按当月 1 日比较；``season`` / ``text`` 不参与比较。"""
    person = _create_person(client, auth_headers)
    next_month_first = (today_local().replace(day=1) + timedelta(days=32)).replace(day=1)

    client.post(
        "/api/important-dates",
        json={
            "personId": person["id"],
            "title": "去杭州入职",
            "date": next_month_first.isoformat(),
            "datePrecision": "month",
        },
        headers=auth_headers,
    )
    client.post(
        "/api/important-dates",
        json={
            "personId": person["id"],
            "title": "寒假",
            "dateText": "寒假",
            "datePrecision": "season",
        },
        headers=auth_headers,
    )

    detail = client.get(f"/api/people/{person['id']}", headers=auth_headers).json()
    assert detail["nextImportantDate"]["title"] == "去杭州入职"


def test_patch_and_delete_person(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _create_person(client, auth_headers)

    patched = client.patch(
        f"/api/people/{person['id']}",
        json={"name": "林夕夕", "notes": "改过的备注", "circleLevel": "core"},
        headers=auth_headers,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["name"] == "林夕夕"
    assert body["notes"] == "改过的备注"
    assert body["circleLevel"] == "core"
    # 没传的字段保持不变。
    assert body["relationshipLabel"] == "大学朋友"

    assert client.delete(f"/api/people/{person['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/people/{person['id']}", headers=auth_headers).status_code == 404


def test_delete_person_cascades_to_children(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§58：删除人物会一并删除近况 / 未完待续 / 重要日期 / 偏好 / 借还 / 互动。"""
    person = _create_person(client, auth_headers)
    person_id = person["id"]

    client.post(
        "/api/interactions",
        json={"personId": person_id, "title": "一起吃火锅", "content": "", "interactionDate": "2026-09-21"},
        headers=auth_headers,
    )
    client.post("/api/updates", json={"personId": person_id, "content": "准备教资"}, headers=auth_headers)
    client.post("/api/commitments", json={"personId": person_id, "content": "发照片"}, headers=auth_headers)
    client.post(
        "/api/important-dates",
        json={"personId": person_id, "title": "生日", "date": "2026-11-12"},
        headers=auth_headers,
    )
    client.post(
        "/api/preferences",
        json={"personId": person_id, "category": "like", "content": "胶片摄影"},
        headers=auth_headers,
    )
    client.post(
        "/api/borrow-records",
        json={
            "personId": person_id,
            "direction": "lent_to",
            "itemName": "50mm 镜头",
            "borrowDate": "2026-08-30",
        },
        headers=auth_headers,
    )

    assert client.delete(f"/api/people/{person_id}", headers=auth_headers).status_code == 204

    # 这些子资源都随人物一起消失：对已删除的人物做任何操作都是 404。
    assert client.get(f"/api/people/{person_id}/updates", headers=auth_headers).status_code == 404
    assert client.get(f"/api/people/{person_id}/interactions", headers=auth_headers).status_code == 404
    assert client.get("/api/commitments", headers=auth_headers).json() == []
    assert client.get("/api/important-dates", headers=auth_headers).json() == []
    assert client.get("/api/preferences", headers=auth_headers).json() == []
    assert client.get("/api/borrow-records", headers=auth_headers).json() == []


def test_people_list_filters_by_group_and_search(client: TestClient, auth_headers: dict[str, str]) -> None:
    group = client.post("/api/groups", json={"name": "摄影社"}, headers=auth_headers).json()
    _create_person(client, auth_headers, name="林夕", groupIds=[group["id"]])
    _create_person(client, auth_headers, name="阿杰", relationshipLabel="高中朋友")

    everyone = client.get("/api/people", headers=auth_headers).json()
    assert {item["name"] for item in everyone} == {"林夕", "阿杰"}

    filtered = client.get(f"/api/people?group={group['id']}", headers=auth_headers).json()
    assert [item["name"] for item in filtered] == ["林夕"]

    searched = client.get("/api/people?search=高中", headers=auth_headers).json()
    assert [item["name"] for item in searched] == ["阿杰"]


def test_groups_expose_person_count(client: TestClient, auth_headers: dict[str, str]) -> None:
    group = client.post("/api/groups", json={"name": "宿舍", "icon": "home"}, headers=auth_headers).json()
    assert group["personCount"] == 0

    _create_person(client, auth_headers, name="小鹿", groupIds=[group["id"]])

    listing = client.get("/api/groups", headers=auth_headers).json()
    assert listing[0]["name"] == "宿舍"
    assert listing[0]["personCount"] == 1
    assert listing[0]["icon"] == "home"


def test_new_group_appends_to_the_end(client: TestClient, auth_headers: dict[str, str]) -> None:
    """新建星系要追加到末尾，而不是挤到最前面（表单里的「＋ 新建星系」依赖这一点）。"""
    first = client.post("/api/groups", json={"name": "甲"}, headers=auth_headers).json()
    second = client.post("/api/groups", json={"name": "乙"}, headers=auth_headers).json()

    assert [item["name"] for item in client.get("/api/groups", headers=auth_headers).json()] == [
        "甲",
        "乙",
    ]
    assert second["sortOrder"] == first["sortOrder"] + 1

    # 显式给了顺序就尊重调用方，不再自动追加。
    explicit = client.post(
        "/api/groups", json={"name": "丙", "sortOrder": -1}, headers=auth_headers
    ).json()
    assert explicit["sortOrder"] == -1
    assert [item["name"] for item in client.get("/api/groups", headers=auth_headers).json()] == [
        "丙",
        "甲",
        "乙",
    ]
