"""조사보고서 프롬프트. 실제 LLM 을 붙일 때 이 파일만 바꾼다."""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = """당신은 결제 이상거래 조사를 돕는 분석 보조자다.
주어진 증거 요약만 근거로 쓰고, 추측으로 사실을 만들지 않는다.
최종 판정은 보안 직원이 한다. 당신은 근거와 권고만 제시한다.
결제 승인·거절·환불 등 상태를 바꾸는 행위는 할 수 없다."""


def build_user_prompt(evidence: dict[str, Any]) -> str:
    """증거 요약을 프롬프트로 만든다. 식별자 원문은 넣지 않는다."""
    signals = evidence["signals"]
    payments = evidence["payments"]
    return (
        "다음 증거를 바탕으로 이 사건의 위험 근거를 요약하고 권고를 제시하라.\n"
        f"- 신호 {signals['count']}건, 최고 위험 점수 {signals['max_risk_score']}\n"
        f"- 신호 종류 {', '.join(signals['source_types']) or '없음'}\n"
        f"- 결제 {payments['count']}건, 보류 {payments['held_count']}건, "
        f"보류 금액 {payments['held_amount']}원\n"
    )
