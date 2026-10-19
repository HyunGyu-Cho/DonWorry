"""실행 설정. 06-4: 주소·비밀값은 환경변수로 관리한다."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AI_SERVER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    # 02-3: 외부/폐쇄망 LLM 교체가 가능하도록 호출 구현을 설정으로 고른다.
    # 기본값은 mock — 실제 제공자를 정하기 전까지 결정적 규칙 기반으로 동작한다.
    llm_provider: Literal["mock"] = "mock"

    # Spring Investigation 쪽 타임아웃이 3초(C04)이므로 그보다 짧게 끝내야 한다.
    analysis_timeout_seconds: float = 2.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
