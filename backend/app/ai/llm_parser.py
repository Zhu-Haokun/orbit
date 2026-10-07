"""LLM 解析器：调用兼容 OpenAI 的 ``/chat/completions``（规范 §45 / §46 / §63）。

只用 ``httpx``，超时 30 秒，``response_format={"type": "json_object"}``。
这一层只负责“拿回一个 JSON 对象”，任何异常都往上抛，
由 :mod:`app.ai.service` 统一降级到规则解析——调用方永远看不到技术错误（§31）。
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

import httpx

from app.ai.prompt import SYSTEM_PROMPT, build_user_message
from app.core.config import settings

#: 网络超时（秒）。规范 §45 只要求“不要卡住用户”。
REQUEST_TIMEOUT_SECONDS = 30.0


class LlmParseError(RuntimeError):
    """LLM 调用或返回值不可用；调用方应降级到规则解析。"""


def is_configured() -> bool:
    """是否配置了可用的 LLM（缺任一配置都算没配置，§32）。"""
    return settings.llm_enabled


def request_json(
    text: str,
    *,
    reference_date: date,
    known_people: list[str],
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """请求一次结构化解析，返回解析后的 JSON 对象。"""
    if not is_configured():
        raise LlmParseError("LLM 未配置")

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.llm_model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_message(text, reference_date, known_people)},
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as exc:  # 网络、HTTP 状态码、非 JSON 响应
        raise LlmParseError("LLM 请求失败") from exc

    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmParseError("LLM 响应结构不符合预期") from exc

    if not isinstance(content, str) or not content.strip():
        raise LlmParseError("LLM 没有返回内容")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise LlmParseError("LLM 返回的不是 JSON") from exc

    if not isinstance(parsed, dict):
        raise LlmParseError("LLM 返回的 JSON 不是对象")
    return parsed


__all__ = ["LlmParseError", "REQUEST_TIMEOUT_SECONDS", "is_configured", "request_json"]
