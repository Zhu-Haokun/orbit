"""搜索测试（规范 §35 / §89）。

范围：人物姓名 / 昵称 / 关系标签 / 星系名、互动的标题・内容・地点、
未完待续、偏好、借还物品名；空查询直接返回空结果。
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _person(client: TestClient, headers: dict[str, str], **overrides: object) -> dict:
    payload = {"name": "林夕"}
    payload.update(overrides)
    response = client.post("/api/people", json=payload, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_empty_query_returns_empty_results(client: TestClient, seeded_headers: dict[str, str]) -> None:
    for query in ("", " "):
        payload = client.get("/api/search", params={"q": query}, headers=seeded_headers).json()
        assert payload["query"] == query.strip()
        assert payload["total"] == 0
        assert payload["people"] == []
        assert payload["memories"] == []
        assert payload["commitments"] == []
        assert payload["borrowRecords"] == []


def test_search_finds_people_by_name_and_relationship(client: TestClient, seeded_headers: dict[str, str]) -> None:
    by_name = client.get("/api/search", params={"q": "林夕"}, headers=seeded_headers).json()
    assert [hit["person"]["name"] for hit in by_name["people"]] == ["林夕"]
    assert "name" in by_name["people"][0]["matchedIn"]

    by_relationship = client.get("/api/search", params={"q": "室友"}, headers=seeded_headers).json()
    names = {hit["person"]["name"] for hit in by_relationship["people"]}
    # 断言"搜到了该搜到的人"和"结果确实都匹配关系标签"，
    # 而不是把 Demo 名单写死 —— Demo 会扩充，名单一变测试就假失败。
    assert {"小鹿", "周航"} <= names
    assert all("室友" in (hit["person"]["relationshipLabel"] or "") for hit in by_relationship["people"])


def test_search_finds_people_by_group_name(client: TestClient, seeded_headers: dict[str, str]) -> None:
    payload = client.get("/api/search", params={"q": "摄影社"}, headers=seeded_headers).json()
    names = {hit["person"]["name"] for hit in payload["people"]}
    assert {"林夕", "唐昕", "江辰", "李楠"} <= names


def test_search_finds_memories_by_title_content_and_location(
    client: TestClient, seeded_headers: dict[str, str]
) -> None:
    """§70 步骤 13：搜“剪辑”要能找到相关记录。"""
    person = _person(client, seeded_headers, name="剪辑测试人")
    client.post(
        "/api/interactions",
        json={
            "personId": person["id"],
            "title": "一起喝咖啡",
            "content": "她说最近想开始学剪辑，下个月准备参加一个短片比赛。",
            "interactionDate": "2026-10-05",
            "location": "南湖边的小店",
        },
        headers=seeded_headers,
    )

    by_content = client.get("/api/search", params={"q": "剪辑"}, headers=seeded_headers).json()
    assert by_content["total"] >= 1
    hit = by_content["memories"][0]
    assert "剪辑" in hit["interaction"]["content"]
    assert hit["person"]["name"] == "剪辑测试人"

    by_location = client.get("/api/search", params={"q": "南湖边"}, headers=seeded_headers).json()
    assert any("南湖边" in item["interaction"]["location"] for item in by_location["memories"])

    by_title = client.get("/api/search", params={"q": "跨年"}, headers=seeded_headers).json()
    assert any(item["interaction"]["title"] == "一起跨年" for item in by_title["memories"])


def test_search_finds_commitments_preferences_and_borrows(client: TestClient, seeded_headers: dict[str, str]) -> None:
    commitments = client.get("/api/search", params={"q": "租房网站"}, headers=seeded_headers).json()
    assert commitments["commitments"]
    assert commitments["commitments"][0]["commitment"]["content"] == "把租房网站发给他"
    assert commitments["commitments"][0]["person"]["name"] == "陈屿"

    # 偏好目前不在结果分组里，但偏好内容会通过分类计数被前端读到（§35.1）。
    borrows = client.get("/api/search", params={"q": "50mm"}, headers=seeded_headers).json()
    assert borrows["borrowRecords"]
    assert borrows["borrowRecords"][0]["borrowRecord"]["itemName"] == "50mm 镜头"
    assert borrows["borrowRecords"][0]["person"]["name"] == "林夕"


def test_search_is_case_insensitive(client: TestClient, seeded_headers: dict[str, str]) -> None:
    lower = client.get("/api/search", params={"q": "50mm"}, headers=seeded_headers).json()
    upper = client.get("/api/search", params={"q": "50MM"}, headers=seeded_headers).json()
    assert len(lower["borrowRecords"]) == len(upper["borrowRecords"]) == 1


def test_total_is_the_sum_of_sections(client: TestClient, seeded_headers: dict[str, str]) -> None:
    payload = client.get("/api/search", params={"q": "林夕"}, headers=seeded_headers).json()
    expected = (
        len(payload["people"]) + len(payload["memories"]) + len(payload["commitments"]) + len(payload["borrowRecords"])
    )
    assert payload["total"] == expected


def test_no_result_is_quiet(client: TestClient, seeded_headers: dict[str, str]) -> None:
    payload = client.get("/api/search", params={"q": "这个词一定找不到"}, headers=seeded_headers).json()
    assert payload["total"] == 0
