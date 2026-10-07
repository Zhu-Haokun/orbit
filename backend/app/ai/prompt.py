"""§46 系统提示：AI 只整理，不判断。

把用户明确写下的内容整理成结构化事实；不确定就返回 null；绝不编造日期；
相对日期基于 ``referenceDate`` 解析；只输出严格 JSON。
"""

from __future__ import annotations

import json
from datetime import date

#: 规范 §46 的系统提示（中文原文 + 输出形状说明）。
SYSTEM_PROMPT = """你只负责从用户明确表达的文本中提取结构化事实。
不要推断人物性格、关系质量、政治、健康、宗教、性取向、恋爱关系、家庭状况等敏感属性。
不确定的信息返回 null。
不要编造具体日期。
相对日期基于 referenceDate 解析。
输出严格 JSON，不要输出任何解释、Markdown 或代码块。

JSON 结构（字段缺失时用 null 或空数组）：
{
  "personCandidates": [{"name": "文本里出现的人名", "confidence": 0.0}],
  "interaction": {
    "title": "一句很短的互动标题，例如 一起喝咖啡",
    "content": "原始文本",
    "interactionDate": "YYYY-MM-DD",
    "location": null,
    "interactionType": null
  },
  "updates": [{"content": "对方的近况，只写用户明确写下的内容"}],
  "commitments": [{"content": "用户答应做的事", "dueDate": null, "dueText": null}],
  "importantDates": [
    {
      "title": "事件名，例如 短片比赛",
      "date": "YYYY-MM-DD 或 null",
      "dateText": "原文里的日期说法，例如 下个月",
      "datePrecision": "exact | month | season | text",
      "repeatType": "none | yearly"
    }
  ],
  "preferences": [{"category": "like | dislike | interest | wish | food | other", "content": "偏好内容"}],
  "borrowRecords": [{"direction": "borrowed_from | lent_to", "itemName": "物品", "borrowDate": null}]
}

规则：
1. 只提取用户明确写出的信息，不做任何推断。
2. 只有出现明确日期表达且是事件时，才填写 importantDates；否则不要编造。
3. 生日使用 repeatType = "yearly"；只知道月份时 datePrecision = "month"。
4. commitments 只包含“用户自己答应要做的事”。
5. 如果没有互动内容，interaction.title 用一句简短概括。
"""


def build_reference_block(reference_date: date, known_people: list[str]) -> str:
    """把参考日期与已知人名附在用户消息里，避免模型自行猜测。"""
    payload = {
        "referenceDate": reference_date.isoformat(),
        "knownPeople": known_people,
    }
    return json.dumps(payload, ensure_ascii=False)


def build_user_message(text: str, reference_date: date, known_people: list[str]) -> str:
    """构造 user 消息：先给上下文，再给原文。"""
    return (
        f"referenceDate: {reference_date.isoformat()}\n"
        f"knownPeople: {json.dumps(known_people, ensure_ascii=False)}\n\n"
        f"文本：\n{text}"
    )


__all__ = ["SYSTEM_PROMPT", "build_reference_block", "build_user_message"]
