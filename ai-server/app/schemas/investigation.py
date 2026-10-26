from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.report import CaseType, ReportDraft


# Spring → ai-server 조사 요청 (ADR-0009 결정 1)
# 작업 ID는 reportId, 시도마다 attemptId가 새로 붙는다. caseType으로 보고서 형식을 고른다 (2-15)
class InvestigationRequest(CamelModel):
    report_id: int = Field(gt=0)
    attempt_id: UUID
    case_id: int = Field(gt=0)
    case_type: CaseType
    evidence_version: int = Field(ge=1)


class AcceptedResponse(CamelModel):
    report_id: int
    attempt_id: UUID
    status: Literal["ACCEPTED"] = "ACCEPTED"


class InvestigationStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


# 조사 과정 한 단계 — 화면 "AI가 조사한 과정"의 재료 (Spring에 알리는 건 2-19b)
class TraceStep(CamelModel):
    kind: Literal["LLM_ANSWER", "VALIDATION"]
    ok: bool
    detail: str
    started_at: datetime
    duration_ms: int


# 실패 이유는 개발자 조사용이다
# Spring이 report_body.error로 저장하고 화면에는 보내지 않는다 (ADR-0009)
class FailureInfo(CamelModel):
    code: Literal["LLM_INVALID_ANSWER", "LLM_ERROR"]
    reason: str
    llm_attempts: int


class InvestigationResult(CamelModel):
    report_id: int
    attempt_id: UUID
    case_id: int
    case_type: CaseType
    evidence_version: int
    status: InvestigationStatus
    report: ReportDraft | None = None
    error: FailureInfo | None = None
    steps: list[TraceStep] = []
