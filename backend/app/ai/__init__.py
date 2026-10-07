"""AI 结构化工具包（规范 §30 / §46 / §32）。

* :mod:`app.ai.prompt` —— §46 的系统提示
* :mod:`app.ai.rules_parser` —— 没有 API key 时的内置规则解析（§32）
* :mod:`app.ai.llm_parser` —— 兼容 OpenAI 的 ``/chat/completions`` 调用
* :mod:`app.ai.service` —— 统一的对外入口，任何失败都退回规则解析
"""

from __future__ import annotations

from app.ai.service import parse_interaction

__all__ = ["parse_interaction"]
