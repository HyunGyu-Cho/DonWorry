"""C04 수신 엔드포인트. 업무 로직은 service 에 둔다 (02-3)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.schemas.report import ReportRequest, ReportResponse
from app.service.report_service import ReportService

router = APIRouter(tags=["reports"])

_service = ReportService()


def get_report_service() -> ReportService:
    return _service


@router.post("/api/reports", response_model=ReportResponse)
def create_report(
    request: ReportRequest,
    service: Annotated[ReportService, Depends(get_report_service)],
) -> ReportResponse:
    """POST /api/reports — Investigation 이 Case 증거를 보내 보고서를 받는다."""
    return service.generate(request)
