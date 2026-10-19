"""C04 보고서 생성 서비스.

- 입력 검증은 Pydantic 이 하고, 여기서는 업무 규칙만 본다.
- 멱등 키는 caseId + evidenceVersion (05-1). 같은 키 재요청은 저장된 결과를 돌려준다.
- Case·증거의 소유자는 Spring Investigation 이다. 여기서는 받은 증거만 쓴다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.agent.graph import LlmClient, MockLlmClient, run_investigation
from app.schemas.report import Recommendation, ReportRequest, ReportResponse, ReportStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _CacheKey:
    case_id: int
    evidence_version: int


class ReportService:
    def __init__(self, llm: LlmClient | None = None) -> None:
        self._llm: LlmClient = llm if llm is not None else MockLlmClient()
        # 1차 MVP 는 프로세스 메모리 캐시. 보고서 정본은 Spring 의 ai_reports 다.
        self._results: dict[_CacheKey, ReportResponse] = {}

    def generate(self, request: ReportRequest) -> ReportResponse:
        key = _CacheKey(request.case_id, request.evidence_version)

        cached = self._results.get(key)
        if cached is not None:
            logger.info(
                "보고서 멱등 재요청 — caseId=%s evidenceVersion=%s",
                request.case_id,
                request.evidence_version,
            )
            return cached

        try:
            summary, recommendation = run_investigation(request, self._llm)
            response = ReportResponse(
                case_id=request.case_id,
                evidence_version=request.evidence_version,
                report_status=ReportStatus.COMPLETED,
                summary=summary,
                recommendation=recommendation,
            )
        except Exception:
            # 실패는 FAILED 로 알린다. 직원의 수동 조사·판정을 막지 않는다 (DEC-05).
            # 증거 내용은 로그에 남기지 않는다.
            logger.exception(
                "보고서 생성 실패 — caseId=%s evidenceVersion=%s",
                request.case_id,
                request.evidence_version,
            )
            return ReportResponse(
                case_id=request.case_id,
                evidence_version=request.evidence_version,
                report_status=ReportStatus.FAILED,
                summary=None,
                recommendation=None,
            )

        self._results[key] = response
        return response

    @staticmethod
    def describe_recommendation(value: Recommendation | None) -> str:
        return value.value if value is not None else "없음"
