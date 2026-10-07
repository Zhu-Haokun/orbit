"""「今天」聚合测试（规范 §33 / §89）。

验证四块内容：重要日期（含去年今日的记忆）、未完待续（含记录来源日期）、
借还、值得回看的记忆；以及 ``headlineCount`` 的统计口径。
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient


def _person(client: TestClient, headers: dict[str, str], name: str = "林夕") -> dict:
    response = client.post("/api/people", json={"name": name}, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _last_year_same_day(today: date) -> date:
    try:
        return today.replace(year=today.year - 1)
    except ValueError:
        return date(today.year - 1, 2, 28)


def test_today_is_empty_for_a_new_user(client: TestClient, auth_headers: dict[str, str]) -> None:
    """没有任何记录时，今天页是安静的，不是任务清单。"""
    payload = client.get("/api/today", headers=auth_headers).json()
    assert payload["headlineCount"] == 0
    assert payload["importantDates"] == []
    assert payload["commitments"] == []
    assert payload["borrowRecords"] == []
    assert payload["memoryPrompts"] == []
    assert date.fromisoformat(payload["date"]) == date.today()


def test_important_date_today_with_last_year_memory(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§33.3：今天的重要日期要带上去年同期的记忆。"""
    today = date.today()
    person = _person(client, auth_headers)

    client.post(
        "/api/interactions",
        json={
            "personId": person["id"],
            "title": "她的生日",
            "content": "送了她一本摄影集。",
            "interactionDate": _last_year_same_day(today).isoformat(),
        },
        headers=auth_headers,
    )
    client.post(
        "/api/important-dates",
        json={
            "personId": person["id"],
            "title": "生日",
            "date": today.isoformat(),
            "repeatType": "yearly",
        },
        headers=auth_headers,
    )

    payload = client.get("/api/today", headers=auth_headers).json()
    assert len(payload["importantDates"]) == 1

    item = payload["importantDates"][0]
    assert item["title"] == "生日"
    assert item["isToday"] is True
    assert item["inDays"] == 0
    assert item["person"]["id"] == person["id"]
    assert item["person"]["name"] == "林夕"
    assert item["lastYearMemory"] is not None
    assert item["lastYearMemory"]["content"] == "送了她一本摄影集。"
    assert item["date"] == today.isoformat()


def test_upcoming_window_is_fourteen_days(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§33.2：只展示今天起 14 天内的重要日期。"""
    today = date.today()
    person = _person(client, auth_headers)

    for title, offset in (("第 3 天", 3), ("第 14 天", 14), ("第 15 天", 15)):
        client.post(
            "/api/important-dates",
            json={"personId": person["id"], "title": title, "date": (today + timedelta(days=offset)).isoformat()},
            headers=auth_headers,
        )

    titles = [item["title"] for item in client.get("/api/today", headers=auth_headers).json()["importantDates"]]
    assert titles == ["第 3 天", "第 14 天"]


def test_month_precision_uses_first_of_month(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§24：``month`` 精度按当月 1 日比较。"""
    today = date.today()
    person = _person(client, auth_headers, name="陈屿")
    first_of_next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)

    client.post(
        "/api/important-dates",
        json={
            "personId": person["id"],
            "title": "去杭州入职",
            "date": first_of_next_month.isoformat(),
            "datePrecision": "month",
            "dateText": "下个月",
        },
        headers=auth_headers,
    )

    payload = client.get("/api/today", headers=auth_headers).json()
    # 下个月 1 日未必落在 14 天窗口里，落到窗口内才检查。
    if (first_of_next_month - today).days <= 14:
        assert payload["importantDates"][0]["date"] == first_of_next_month.isoformat()
        assert payload["importantDates"][0]["datePrecision"] == "month"


def test_commitments_and_borrows_appear(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§33.4 / §33.2：未完待续与借还都要出现，并带上人物与记录日期。"""
    today = date.today()
    person = _person(client, auth_headers, name="妈妈")

    interaction = client.post(
        "/api/interactions",
        json={"personId": person["id"], "title": "视频通话", "content": "", "interactionDate": today.isoformat()},
        headers=auth_headers,
    ).json()
    client.post(
        "/api/commitments",
        json={
            "personId": person["id"],
            "content": "周末帮忙看路由器型号",
            "sourceInteractionId": interaction["id"],
            "dueDate": (today + timedelta(days=2)).isoformat(),
        },
        headers=auth_headers,
    )
    client.post(
        "/api/borrow-records",
        json={
            "personId": person["id"],
            "direction": "lent_to",
            "itemName": "50mm 镜头",
            "borrowDate": today.isoformat(),
        },
        headers=auth_headers,
    )

    payload = client.get("/api/today", headers=auth_headers).json()

    assert len(payload["commitments"]) == 1
    commitment = payload["commitments"][0]
    assert commitment["content"] == "周末帮忙看路由器型号"
    assert commitment["person"]["name"] == "妈妈"
    # recordedAt 来自来源互动的日期（§45 TodayCommitment）。
    assert commitment["recordedAt"].startswith(today.isoformat())

    assert len(payload["borrowRecords"]) == 1
    borrow = payload["borrowRecords"][0]
    assert borrow["itemName"] == "50mm 镜头"
    assert borrow["direction"] == "lent_to"
    assert borrow["status"] == "open"
    assert borrow["person"]["name"] == "妈妈"

    # §33.1：headlineCount 只统计重要日期 + 未完待续 + 借还，记忆提示不计入。
    assert payload["headlineCount"] == 2


def test_memory_prompts_for_stale_people(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§33.5：超过 45 天没有新记录的人，出现在“值得回看的记忆”里。"""
    today = date.today()
    stale = _person(client, auth_headers, name="阿杰")
    fresh = _person(client, auth_headers, name="林夕")

    client.post(
        "/api/interactions",
        json={
            "personId": stale["id"],
            "title": "一起吃烤肉",
            "content": "聊到高中时候的社团活动。",
            "interactionDate": (today - timedelta(days=198)).isoformat(),
        },
        headers=auth_headers,
    )
    client.post(
        "/api/interactions",
        json={"personId": fresh["id"], "title": "一起吃火锅", "content": "", "interactionDate": today.isoformat()},
        headers=auth_headers,
    )

    prompts = client.get("/api/today", headers=auth_headers).json()["memoryPrompts"]
    assert len(prompts) == 1
    prompt = prompts[0]
    assert prompt["person"]["name"] == "阿杰"
    assert prompt["lastInteractionTitle"] == "一起吃烤肉"
    assert prompt["daysSince"] == 198
    assert prompt["lastInteractionAt"] is not None

    # 记忆提示不算进 headlineCount。
    payload = client.get("/api/today", headers=auth_headers).json()
    assert payload["headlineCount"] == 0
