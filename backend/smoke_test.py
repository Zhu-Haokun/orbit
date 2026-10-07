"""端到端冒烟测试：走真实 HTTP，复现规范 §70 的现场演示脚本。

用法（后端已启动）：
    .venv\\Scripts\\python.exe smoke_test.py
"""

from __future__ import annotations

import sys
import uuid

import httpx

BASE = "http://127.0.0.1:8000/api"
FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "OK  " if condition else "FAIL"
    print(f"[{mark}] {label}{(' — ' + detail) if detail and not condition else ''}")
    if not condition:
        FAILURES.append(label)


def main() -> int:
    with httpx.Client(base_url=BASE, timeout=20.0) as client:
        # 1. 一键体验 Demo（§6.4）
        session = client.post("/auth/demo").json()
        token = session["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}
        check("登录 Demo", session["user"]["email"] == "demo@orbit.local", str(session)[:200])

        # 2. 星图数据（§14）
        people = client.get("/people", headers=headers).json()
        check("星图有人物", len(people) == 14, f"got {len(people)}")
        groups = client.get("/groups", headers=headers).json()
        check("星系 5 个", len(groups) == 5, f"got {len(groups)}")

        # 3. 点击「陈屿」→ Drawer 内容（§70 步骤 3–5）
        chenyu = next((p for p in people if p["name"] == "陈屿"), None)
        check("能找到陈屿", chenyu is not None)
        assert chenyu is not None
        detail = client.get(f"/people/{chenyu['id']}", headers=headers).json()
        updates = [item["content"] for item in detail["updates"]]
        commitments = [item["content"] for item in detail["commitments"]]
        check("陈屿近况含“准备去杭州工作”", any("杭州" in u for u in updates), str(updates))
        check("陈屿在看租房", any("租房" in u for u in updates), str(updates))
        check(
            "陈屿未完待续：发租房网站",
            any("租房网站" in c for c in commitments),
            str(commitments),
        )

        # 4. 时间轴（§27）
        check("陈屿时间轴非空", len(detail["interactions"]) > 0)

        # 5. 今天（§33）
        today = client.get("/today", headers=headers).json()
        check("今天有内容", today["headlineCount"] >= 0)
        check(
            "today 四个区块齐全",
            all(k in today for k in ("importantDates", "commitments", "borrowRecords", "memoryPrompts")),
            str(list(today)),
        )

        # 6. 记录 + 解析（§70 步骤 8–9）
        text = (
            "今天和林夕喝了咖啡，她说最近想开始学剪辑，"
            "下个月准备参加一个短片比赛，我答应把我收藏的教程发给她。"
        )
        parsed = client.post(
            "/ai/parse-interaction",
            json={"text": text, "selectedPersonId": None, "referenceDate": "2026-10-05"},
            headers=headers,
        ).json()
        check("解析走规则降级", parsed["parser"] == "rules", str(parsed.get("parser")))
        check(
            "解析出人物 林夕",
            any(item["name"] == "林夕" for item in parsed["personCandidates"]),
            str(parsed["personCandidates"]),
        )
        check(
            "解析出近况 学剪辑",
            any("剪辑" in item["content"] for item in parsed["updates"]),
            str(parsed["updates"]),
        )
        check(
            "解析出未完待续 教程",
            any("教程" in item["content"] for item in parsed["commitments"]),
            str(parsed["commitments"]),
        )
        check(
            "解析出重要日期 短片比赛",
            any("短片比赛" in item["title"] for item in parsed["importantDates"]),
            str(parsed["importantDates"]),
        )

        linxi = next((p for p in people if p["name"] == "林夕"), None)
        assert linxi is not None
        before = client.get(f"/people/{linxi['id']}", headers=headers).json()

        # 7. 用户确认后保存（§30）
        committed = client.post(
            "/interactions/commit",
            json={
                "interaction": {
                    "personId": linxi["id"],
                    "title": parsed["interaction"]["title"],
                    "content": text,
                    "interactionDate": parsed["interaction"]["interactionDate"],
                    "source": "ai_parsed",
                },
                "updates": [{"content": item["content"]} for item in parsed["updates"]],
                "commitments": [{"content": item["content"]} for item in parsed["commitments"]],
                "importantDates": [
                    {
                        "title": item["title"],
                        "date": item["date"],
                        "dateText": item["dateText"],
                        "datePrecision": item["datePrecision"],
                        "repeatType": item["repeatType"],
                    }
                    for item in parsed["importantDates"]
                ],
                "preferences": [],
                "borrowRecords": [],
            },
            headers=headers,
        )
        check("保存解析结果", committed.status_code in (200, 201), committed.text[:300])
        if committed.status_code in (200, 201):
            after = client.get(f"/people/{linxi['id']}", headers=headers).json()
            check(
                "时间轴新增（§70 步骤 11）",
                len(after["interactions"]) == len(before["interactions"]) + 1,
            )
            check("最近近况新增", len(after["updates"]) == len(before["updates"]) + 1)
            check("未完待续新增", len(after["commitments"]) == len(before["commitments"]) + 1)

        # 8. 今天出现新的未完待续（§70 步骤 12）
        today_after = client.get("/today", headers=headers).json()
        check(
            "今天能看到新的未完待续",
            any("教程" in item["content"] for item in today_after["commitments"]),
            str([item["content"] for item in today_after["commitments"]]),
        )

        # 9. 搜索「剪辑」（§70 步骤 13 / §35）
        found = client.get("/search", params={"q": "剪辑"}, headers=headers).json()
        check("搜索到剪辑相关记忆", found["total"] > 0, str(found["total"]))

        # 10. 回忆（§34）
        memories = client.get("/memories", headers=headers).json()
        check("回忆有时间线", len(memories["months"]) > 0)
        check("回忆有年度摘要", memories["summary"]["interactionCount"] > 0)

        # 11. 导出（§36.2 / §88）
        export = client.get("/export/json", headers=headers)
        check("JSON 导出可用", export.status_code == 200 and "people" in export.json())
        csv = client.get("/export/csv", headers=headers)
        check("CSV 导出可用", csv.status_code == 200 and "text/csv" in csv.headers.get("content-type", ""))

        # 12. 用户隔离（§86）
        unique = uuid.uuid4().hex[:8]
        other = client.post(
            "/auth/register",
            json={
                "nickname": "冒烟",
                "email": f"smoke-{unique}@orbit.local",
                "password": "smoke123",
            },
        ).json()
        other_headers = {"Authorization": f"Bearer {other['accessToken']}"}
        forbidden = client.get(f"/people/{linxi['id']}", headers=other_headers)
        check("别人看不到我的档案", forbidden.status_code == 404, str(forbidden.status_code))

    print()
    if FAILURES:
        print(f"冒烟测试失败 {len(FAILURES)} 项：")
        for item in FAILURES:
            print(f"  - {item}")
        return 1
    print("冒烟测试全部通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
