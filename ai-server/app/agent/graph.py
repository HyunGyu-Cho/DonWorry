"""조사 흐름과 LLM 호출 경계.

02-3: 외부/폐쇄망 LLM 으로 교체할 수 있도록 호출 인터페이스를 분리한다.
LLM 제공자가 확정되기 전까지는 MockLlmClient 가 결정적으로 동작하며,
pytest 도 이 구현을 쓴다. LangGraph 로 흐름을 올리는 작업은 제공자 확정 후.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.agent.prompts import SYSTEM_PROMPT, build_user_prompt
from app.agent.tools import collect_evidence
from app.schemas.report import Recommendation, ReportRequest


class LlmClient(Protocol):
    """LLM 호출 경계. 구현을 바꿔도 service 는 손대지 않는다."""

    def analyze(self, system_prompt: str, user_prompt: str) -> tuple[str, Recommendation]: ...


class MockLlmClient:
    """규칙 기반 대체 구현. 같은 입력이면 항상 같은 결과를 낸다."""

    def analyze(self, system_prompt: str, user_prompt: str) -> tuple[str, Recommendation]:
        del system_prompt  # Mock 은 시스템 프롬프트를 쓰지 않는다
        return user_prompt.strip(), Recommendation.NEEDS_MORE_EVIDENCE


def decide_recommendation(evidence: dict[str, Any]) -> Recommendation:
    """증거 요약만으로 내리는 보수적 권고. 직원 판정을 대신하지 않는다."""
    max_score = evidence["signals"]["max_risk_score"]
    held_count = evidence["payments"]["held_count"]

    if max_score is None or held_count == 0:
        return Recommendation.NEEDS_MORE_EVIDENCE
    if max_score > 80:
        return Recommendation.REJECT_SUGGESTED
    if max_score < 50:
        return Recommendation.RELEASE_SUGGESTED
    return Recommendation.NEEDS_MORE_EVIDENCE


def run_investigation(
    request: ReportRequest,
    llm: LlmClient,
) -> tuple[str, Recommendation]:
    """증거 수집 → 프롬프트 구성 → LLM 호출 → 권고 결정."""
    evidence = collect_evidence(request)
    summary, _ = llm.analyze(SYSTEM_PROMPT, build_user_prompt(evidence))
    return summary, decide_recommendation(evidence)
