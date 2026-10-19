"""FastAPI 진입점. 포트 8000 (Notion 01 서버 포트)."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.config import get_settings
from app.controller import report

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="DonWorry AI Server",
    description="AI 조사보고서 생성. 읽기 전용이며 결제 상태를 바꾸지 않는다.",
    version="0.0.1",
)
app.include_router(report.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP"}
