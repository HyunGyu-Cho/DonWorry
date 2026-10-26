from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


# Spring과 주고받는 JSON은 camelCase (Java 필드 이름 그대로)
class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# Spring → ai-server 조사 요청 (ADR-0009 결정 1)
# 작업 ID는 reportId, 시도마다 attemptId가 새로 붙는다
class InvestigationRequest(CamelModel):
    report_id: int = Field(gt=0)
    attempt_id: UUID
    case_id: int = Field(gt=0)
    evidence_version: int = Field(ge=1)


class AcceptedResponse(CamelModel):
    report_id: int
    attempt_id: UUID
    status: Literal["ACCEPTED"] = "ACCEPTED"


class InvestigationStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


# AI가 쓴 보고서 초안 — 형식 검사 기준. 3유형 전체 구조는 2-15에서 넓힌다
class ReportDraft(CamelModel):
    conclusion: str = Field(min_length=1)
    risk_score: int = Field(ge=0, le=100)
    recommendation: Literal["ACCEPT_REVIEW", "REJECT_REVIEW", "NEEDS_CHECK"]
    risk_evidence: list[str] = Field(min_length=1)
    normal_evidence: list[str] = []
    unknowns: list[str] = []
    # "확인할 것" — 직원이 판정 전에 볼 것. 비면 형식 실패로 다시 묻는다
    additional_checks: list[str] = Field(min_length=1)


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
    evidence_version: int
    status: InvestigationStatus
    report: ReportDraft | None = None
    error: FailureInfo | None = None
    steps: list[TraceStep] = []
