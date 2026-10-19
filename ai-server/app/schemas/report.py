"""C04 요청/응답 계약. 정본은 Notion 05-1 외부 HTTP API."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """계약은 camelCase, 파이썬 코드는 snake_case 로 쓴다."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class SubjectType(StrEnum):
    PAYMENT_CUSTOMER = "PAYMENT_CUSTOMER"
    PLATFORM_USER = "PLATFORM_USER"


class SourceType(StrEnum):
    FDS_ALERT = "FDS_ALERT"
    LOGIN_EVENT = "LOGIN_EVENT"


class ReportStatus(StrEnum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Recommendation(StrEnum):
    """AI 권고. 직원의 최종 판정이 아니다 (02-3)."""

    REJECT_SUGGESTED = "REJECT_SUGGESTED"
    RELEASE_SUGGESTED = "RELEASE_SUGGESTED"
    NEEDS_MORE_EVIDENCE = "NEEDS_MORE_EVIDENCE"


class Signal(CamelModel):
    source_type: SourceType
    source_id: int
    risk_score: int | None = Field(default=None, ge=0, le=100)
    occurred_at: datetime
    reason: str | None = Field(default=None, max_length=500)


class PaymentEvidence(CamelModel):
    payment_id: int
    amount: int = Field(ge=0, description="KRW 원 단위")
    status: str = Field(max_length=20)
    occurred_at: datetime


class ReportRequest(CamelModel):
    report_request_id: str = Field(max_length=100)
    case_id: int
    evidence_version: int = Field(ge=0)
    merchant_id: int
    subject_type: SubjectType
    signals: list[Signal] = Field(default_factory=list)
    payments: list[PaymentEvidence] = Field(default_factory=list)


class ReportResponse(CamelModel):
    case_id: int
    evidence_version: int
    report_status: ReportStatus
    summary: str | None = None
    recommendation: Recommendation | None = None
