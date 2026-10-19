"""Tool allowlist 테스트 — 02-3 보안 조건."""

import pytest

from app.agent.tools import ALLOWED_TOOLS, ToolNotAllowedError, call_tool


def test_allowlist_contents():
    assert ALLOWED_TOOLS == {"summarize_signals", "summarize_payments"}


def test_unlisted_tool_is_blocked():
    with pytest.raises(ToolNotAllowedError):
        call_tool("update_payment_status", [])


def test_summarize_payments_counts_held_amount():
    from app.schemas.report import PaymentEvidence

    payments = [
        PaymentEvidence(
            paymentId=1, amount=700000, status="HELD", occurredAt="2026-10-23T01:00:00Z"
        ),
        PaymentEvidence(
            paymentId=2, amount=100000, status="APPROVED", occurredAt="2026-10-23T01:05:00Z"
        ),
    ]

    result = call_tool("summarize_payments", payments)

    assert result["held_count"] == 1
    assert result["held_amount"] == 700000
    assert result["max_amount"] == 700000
