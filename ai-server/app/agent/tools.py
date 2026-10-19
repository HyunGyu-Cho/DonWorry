"""Agent 가 쓸 수 있는 Tool 과 allowlist.

02-3 제약:
- 읽기 전용만. 결제 상태 변경·데이터 변경 금지.
- allowlist 에 없는 Tool 은 호출 자체가 막힌다.
- 민감정보는 로그·프롬프트에 그대로 넣지 않는다.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, cast

from app.schemas.report import PaymentEvidence, ReportRequest, Signal

# allowlist — 이름을 여기 등록하지 않은 Tool 은 호출되지 않는다.
ALLOWED_TOOLS: frozenset[str] = frozenset(
    {
        "summarize_signals",
        "summarize_payments",
    }
)


class ToolNotAllowedError(RuntimeError):
    """allowlist 밖의 Tool 을 호출하려 한 경우."""


def summarize_signals(signals: Sequence[Signal]) -> dict[str, Any]:
    """연결된 신호를 집계한다. 원천 ID 외의 식별자는 다루지 않는다."""
    scores = [s.risk_score for s in signals if s.risk_score is not None]
    return {
        "count": len(signals),
        "max_risk_score": max(scores) if scores else None,
        "source_types": sorted({s.source_type.value for s in signals}),
    }


def summarize_payments(payments: Sequence[PaymentEvidence]) -> dict[str, Any]:
    """연결된 결제를 집계한다. 카드번호 등 결제수단 원문은 입력에 없다."""
    held = [p for p in payments if p.status == "HELD"]
    return {
        "count": len(payments),
        "held_count": len(held),
        "held_amount": sum(p.amount for p in held),
        "max_amount": max((p.amount for p in payments), default=0),
    }


_REGISTRY: dict[str, Callable[[Sequence[object]], dict[str, Any]]] = {
    "summarize_signals": cast("Callable[[Sequence[object]], dict[str, Any]]", summarize_signals),
    "summarize_payments": cast("Callable[[Sequence[object]], dict[str, Any]]", summarize_payments),
}


def call_tool(name: str, evidence: Sequence[Signal] | Sequence[PaymentEvidence]) -> dict[str, Any]:
    """allowlist 를 통과한 Tool 만 실행한다. 인자는 증거 목록 하나로 고정한다."""
    if name not in ALLOWED_TOOLS or name not in _REGISTRY:
        raise ToolNotAllowedError(f"허용되지 않은 Tool: {name}")
    return _REGISTRY[name](evidence)


def collect_evidence(request: ReportRequest) -> dict[str, Any]:
    """보고서 입력으로 쓸 증거 요약. Tool 호출은 모두 이 경로를 지난다."""
    return {
        "signals": call_tool("summarize_signals", request.signals),
        "payments": call_tool("summarize_payments", request.payments),
    }
