"""应用配置（规范 §63 环境变量）。

所有可变行为都通过环境变量或 ``.env`` 提供，默认值保证“clone 下来就能跑”：
默认 SQLite 文件、内置规则解析器、无网络调用。
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("orbit.config")

#: PyJWT 对 HS256 的推荐最小密钥长度（RFC 7518 §3.2）。
MIN_JWT_SECRET_BYTES = 32

#: 文档 P2-3 里点名的默认值：开发能用，生产必须换掉。
DEFAULT_JWT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    """Runtime settings, loaded from environment / ``.env``."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    #: development 允许默认值；production 会在启动时直接报错（见下面的校验器）。
    environment: Literal["development", "production"] = "development"

    # --- 数据库（规范 §6.3：本地 SQLite，可切 PostgreSQL） ---
    database_url: str = "sqlite:///./orbit.db"

    # --- 鉴权（规范 §6.4 / §86） ---
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    # --- CORS ---
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- 上传（规范 §57） ---
    upload_dir: str = "./uploads"
    max_upload_mb: int = 5

    # --- 可选 LLM（留空则使用内置规则解析器，规范 §31 / §32） ---
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = "https://api.openai.com/v1"

    @property
    def cors_origin_list(self) -> list[str]:
        """Comma separated ``CORS_ORIGINS`` as a list."""
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def llm_enabled(self) -> bool:
        """LLM 只有在同时配置 key 与 model 时才启用（规范 §32 降级）。"""
        return bool(self.llm_api_key.strip() and self.llm_model.strip())

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @model_validator(mode="after")
    def _check_jwt_secret(self) -> Settings:
        """文档 P2-3：生产环境必须用足够长的 JWT_SECRET，并在启动时明确报错。"""
        secret = self.jwt_secret or ""
        weak = len(secret.encode("utf-8")) < MIN_JWT_SECRET_BYTES or secret == DEFAULT_JWT_SECRET

        if self.environment == "production" and weak:
            raise ValueError(
                "生产环境必须配置足够长的 JWT_SECRET（至少 "
                f"{MIN_JWT_SECRET_BYTES} 字节，且不能是默认值）。"
                "请在 backend/.env 里设置 JWT_SECRET 后重启。"
            )
        if weak:
            logger.warning(
                "正在使用开发用的默认 JWT_SECRET，仅供本地使用；"
                "部署前请在 backend/.env 里换成至少 %d 字节的随机字符串。",
                MIN_JWT_SECRET_BYTES,
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor (import-safe, test friendly)."""
    return Settings()


settings = get_settings()
