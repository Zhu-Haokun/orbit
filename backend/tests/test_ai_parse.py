"""AI 规则解析测试（规范 §32 / §45 / §46 / §70 / §89）。

重点是两个**验收示例**必须逐字段成立——它们是前端记录页的基线行为：

* 示例 A（§45）：老陈 + 咖啡 + 杭州工作 + 发租房网站
* 示例 B（§70 步骤 8）：林夕 + 咖啡 + 学剪辑 + 短片比赛 + 发教程
"""

from __future__ import annotations

from fastapi.testclient import TestClient

EXAMPLE_A = "今天跟老陈喝咖啡，他说下个月准备去杭州工作，我答应把租房网站发给他。"
EXAMPLE_A_DATE = "2026-10-05"

EXAMPLE_B = "今天和林夕喝了咖啡，她说最近想开始学剪辑，下个月准备参加一个短片比赛，我答应把我收藏的教程发给她。"
EXAMPLE_B_DATE = "2026-10-05"


def _create_person(client: TestClient, headers: dict[str, str], name: str, **extra: object) -> dict:
    payload = {"name": name}
    payload.update(extra)
    response = client.post("/api/people", json=payload, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _parse(
    client: TestClient, headers: dict[str, str], text: str, reference: str, person_id: str | None = None
) -> dict:
    response = client.post(
        "/api/ai/parse-interaction",
        json={"text": text, "selectedPersonId": person_id, "referenceDate": reference},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_example_a_matches_the_spec(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§45 示例：字段级验收。"""
    laochen = _create_person(client, auth_headers, "老陈", relationshipLabel="前同事")

    result = _parse(client, auth_headers, EXAMPLE_A, EXAMPLE_A_DATE)

    # 没有 LLM key 时必须走规则解析器（§32）。
    assert result["parser"] == "rules"

    # 人物：老陈，置信度 ≥ 0.9。
    names = [item["name"] for item in result["personCandidates"]]
    assert "老陈" in names
    matched = next(item for item in result["personCandidates"] if item["name"] == "老陈")
    assert matched["id"] == laochen["id"]
    assert matched["confidence"] >= 0.9

    # 互动：一起喝咖啡。
    interaction = result["interaction"]
    assert interaction["title"] == "一起喝咖啡"
    assert interaction["interactionDate"] == EXAMPLE_A_DATE
    assert interaction["content"] == EXAMPLE_A

    # 近况：下个月准备去杭州工作。
    assert [item["content"] for item in result["updates"]] == ["下个月准备去杭州工作"]

    # 未完待续：把租房网站发给他（没有明确期限）。
    assert result["commitments"] == [{"content": "把租房网站发给他", "dueDate": None, "dueText": None}]

    # 没有事件名词，因此没有重要日期。
    assert result["importantDates"] == []


def test_example_b_matches_the_spec(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§70 步骤 8：字段级验收。"""
    linxi = _create_person(client, auth_headers, "林夕", relationshipLabel="大学朋友")

    result = _parse(client, auth_headers, EXAMPLE_B, EXAMPLE_B_DATE)

    assert result["parser"] == "rules"
    assert [item["name"] for item in result["personCandidates"]] == ["林夕"]
    assert result["personCandidates"][0]["id"] == linxi["id"]

    assert result["interaction"]["title"] == "一起喝咖啡"
    assert result["interaction"]["interactionDate"] == EXAMPLE_B_DATE

    assert [item["content"] for item in result["updates"]] == ["最近开始学剪辑"]

    assert len(result["importantDates"]) == 1
    important = result["importantDates"][0]
    assert "短片比赛" in important["title"]
    assert important["datePrecision"] == "month"
    assert important["dateText"] == "下个月"
    assert important["repeatType"] == "none"
    # 下个月 = 2026-11，落到 11 月 1 日。
    assert important["date"] == "2026-11-01"

    assert [item["content"] for item in result["commitments"]] == ["把我收藏的教程发给她"]


def test_person_candidate_falls_back_to_selected_person(client: TestClient, auth_headers: dict[str, str]) -> None:
    """文本里没提到人时，用记录页已选的人物（置信度 1.0）。"""
    person = _create_person(client, auth_headers, "郑可")

    result = _parse(client, auth_headers, "今天一起吃了饭，聊了很多。", "2026-10-05", person["id"])

    assert len(result["personCandidates"]) == 1
    candidate = result["personCandidates"][0]
    assert candidate["id"] == person["id"]
    assert candidate["confidence"] == 1.0


def test_birthday_becomes_yearly_important_date(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create_person(client, auth_headers, "苏晴")

    result = _parse(client, auth_headers, "苏晴的生日是 11 月 12 日，我记一下。", "2026-10-05")

    dates = result["importantDates"]
    assert len(dates) == 1
    assert dates[0]["title"] == "生日"
    assert dates[0]["repeatType"] == "yearly"
    assert dates[0]["date"] == "2026-11-12"


def test_borrow_statement_is_recognised(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create_person(client, auth_headers, "唐昕")

    result = _parse(client, auth_headers, "唐昕借走了我的 50mm 镜头。", "2026-10-05")

    assert len(result["borrowRecords"]) == 1
    borrow = result["borrowRecords"][0]
    assert borrow["direction"] == "borrowed_from"
    assert "镜头" in borrow["itemName"]


def test_title_falls_back_when_nothing_matches(client: TestClient, auth_headers: dict[str, str]) -> None:
    """任何输入都要返回一个可用的标题（§45）。"""
    _create_person(client, auth_headers, "周航")

    result = _parse(client, auth_headers, "唔。", "2026-10-05")

    assert result["interaction"]["title"]
    assert result["interaction"]["interactionDate"] == "2026-10-05"
    assert result["interaction"]["content"] == "唔。"


def test_parser_never_surfaces_a_technical_error(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: object
) -> None:
    """即使 LLM 被配置成坏的，用户也只看到正常的解析结果（§31）。"""
    from app.ai import llm_parser

    monkeypatch.setattr(llm_parser, "is_configured", lambda: True)  # type: ignore[attr-defined]

    def _boom(*args: object, **kwargs: object) -> dict:
        raise llm_parser.LlmParseError("模拟网络失败")

    monkeypatch.setattr(llm_parser, "request_json", _boom)  # type: ignore[attr-defined]
    _create_person(client, auth_headers, "老陈")

    result = _parse(client, auth_headers, EXAMPLE_A, EXAMPLE_A_DATE)
    assert result["parser"] == "rules"
    assert result["interaction"]["title"] == "一起喝咖啡"


def test_commit_parse_saves_everything_atomically(client: TestClient, seeded_headers: dict[str, str]) -> None:
    """§30 / §70 步骤 9–11：确认保存后，人物详情立即反映新记录。"""
    person = client.post("/api/people", json={"name": "小鹿"}, headers=seeded_headers).json()

    payload = {
        "interaction": {
            "personId": person["id"],
            "title": "一起喝咖啡",
            "content": EXAMPLE_B,
            "interactionDate": EXAMPLE_B_DATE,
        },
        "updates": [{"content": "最近开始学剪辑"}],
        "commitments": [{"content": "把我收藏的教程发给她", "dueDate": None, "dueText": None}],
        "importantDates": [
            {
                "title": "短片比赛",
                "date": "2026-11-01",
                "dateText": "下个月",
                "datePrecision": "month",
                "repeatType": "none",
            }
        ],
        "preferences": [{"category": "interest", "content": "剪辑"}],
        "borrowRecords": [],
        "attachmentUrls": ["/uploads/tutorial.png"],
    }
    committed = client.post("/api/interactions/commit", json=payload, headers=seeded_headers)
    assert committed.status_code in (200, 201), committed.text

    body = committed.json()
    assert body["interaction"]["source"] == "ai_parsed"
    assert body["interaction"]["personId"] == person["id"]
    assert [item["content"] for item in body["updates"]] == ["最近开始学剪辑"]
    assert [item["content"] for item in body["commitments"]] == ["把我收藏的教程发给她"]
    assert [item["title"] for item in body["importantDates"]] == ["短片比赛"]
    assert [item["category"] for item in body["preferences"]] == ["interest"]
    # 子记录都要指回这条互动（§22 / §23 的来源日期）。
    assert body["updates"][0]["sourceInteractionId"] == body["interaction"]["id"]
    assert body["commitments"][0]["sourceInteractionId"] == body["interaction"]["id"]
    assert body["preferences"][0]["sourceInteractionId"] == body["interaction"]["id"]
    assert len(body["interaction"]["attachments"]) == 1

    # 人物详情立刻有变化。
    detail = client.get(f"/api/people/{person['id']}", headers=seeded_headers).json()
    assert detail["interactionCount"] == 1
    assert detail["latestUpdate"] == "最近开始学剪辑"
    assert detail["openCommitmentCount"] == 1
    assert detail["interactions"][0]["title"] == "一起喝咖啡"
    assert detail["importantDates"][0]["title"] == "短片比赛"

    # 新未完待续出现在“今天”。
    today = client.get("/api/today", headers=seeded_headers).json()
    assert "把我收藏的教程发给她" in [item["content"] for item in today["commitments"]]

    # 搜“剪辑”能找到（§70 步骤 13）。
    found = client.get("/api/search", params={"q": "剪辑"}, headers=seeded_headers).json()
    assert any(hit["person"]["name"] == "小鹿" for hit in found["memories"])


def test_commit_parse_is_all_or_nothing(client: TestClient, seeded_headers: dict[str, str]) -> None:
    """一个事务：人物不存在时整次保存失败，不会留下半条记录。"""
    before = len(client.get("/api/commitments", headers=seeded_headers).json())

    payload = {
        "interaction": {
            "personId": "0b6d2c1a-0000-4000-8000-000000000009",
            "title": "一起喝咖啡",
            "content": "不该被保存",
            "interactionDate": EXAMPLE_B_DATE,
        },
        "updates": [{"content": "不该存在"}],
        "commitments": [{"content": "也不该存在"}],
        "importantDates": [],
        "preferences": [],
        "borrowRecords": [],
    }
    failed = client.post("/api/interactions/commit", json=payload, headers=seeded_headers)
    assert failed.status_code == 404

    assert len(client.get("/api/commitments", headers=seeded_headers).json()) == before
    assert not any(
        item["title"] == "一起喝咖啡" and item["content"] == "不该被保存"
        for person in client.get("/api/people", headers=seeded_headers).json()
        for item in client.get(f"/api/people/{person['id']}/interactions", headers=seeded_headers).json()
    )
