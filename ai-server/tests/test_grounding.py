import asyncio
import json

from app.agent.grounding import check_grounding
from app.agent.investigator import InvestigationAgent
from app.agent.llm import LlmMessage, MockLlmClient
from app.schemas.investigation import InvestigationStatus
from app.schemas.report import REPORT_DRAFT, PaymentFraudDraft
from app.service.investigations import InvestigationService
from tests.test_agent_tools import PAYMENT, FakeTools, request


def tool(name: str, data: list[dict[str, object]], ready: bool = True) -> LlmMessage:
    body = {"tool": name, "ready": ready, "note": None, "data": data}
    return LlmMessage(role="tool", tool_name=name, content=json.dumps(body))


# 김민수 시나리오처럼 받은 증거 — 65만 원, 이전 완료 5건 평균 4만 원 · 최고 43,000원 · 16.3배
EVIDENCE = [
    tool("get_fds_evidence", [{"paymentId": PAYMENT, "riskScore": 55, "ruleHits": ["NEW_CARD"]}]),
    tool("get_case_payments", [{"paymentId": PAYMENT, "amount": 650_000}]),
    tool(
        "get_payment_history",
        [
            {
                "paymentId": PAYMENT,
                "capturedCount": 5,
                "capturedAverageAmount": 40_000,
                "capturedMaxAmount": 43_000,
                "amountToAverageRatio": 16.3,
            }
        ],
    ),
    tool("get_security_events", [], ready=False),
]


def draft(**changes: object) -> PaymentFraudDraft:
    body: dict[str, object] = {
        "reportType": "PAYMENT_FRAUD",
        "riskScore": 55,
        "verdict": "평소의 16.3배 금액이라 확인이 필요합니다",
        "summary": (
            "평소 4만 원대(최고 43,000원)를 쓰던 고객이 65만 원을 결제했습니다. 이전 결제 5건"
        ),
        "recommendations": [{"label": "구매자 본인 확인", "kind": "INFO"}],
        "riskPoints": [
            {"title": "처음 쓰는 카드", "detail": "650,000원 결제", "source": "get_fds_evidence"},
            {"title": "평소보다 큰 금액", "detail": "16.25배", "source": "get_payment_history"},
        ],
        "normalPoints": [],
        "unknowns": [],
        "checks": ["구매자에게 결제 여부 확인"],
        "paymentAdvice": [
            {"paymentId": PAYMENT, "recommendation": "NEEDS_CHECK", "reason": "본인 확인 전"}
        ],
    }
    body.update(changes)
    parsed = REPORT_DRAFT.validate_python(body)
    assert isinstance(parsed, PaymentFraudDraft)
    return parsed


def problems(d: PaymentFraudDraft) -> list[str]:
    return check_grounding(d, EVIDENCE, [int(PAYMENT)]).problems


# 받은 증거와 같은 숫자 — 만 원 단위 · 반올림(16.25 ↔ 16.3) · 목록 길이 · 정수 만 원도 통과
def test_grounded_passes() -> None:
    assert problems(draft()) == []


def test_sourceNotReceived_isProblem() -> None:
    point = {"title": "낯선 기기", "detail": "새 기기", "source": "get_security_events"}
    assert problems(draft(normalPoints=[point])) == [
        "'낯선 기기'의 출처 get_security_events는 받은 증거가 아님"
    ]


def test_madeUpNumbers_areProblems() -> None:
    found = problems(draft(summary="평소의 37.5배, 120만 원, 이전 결제 9건"))
    assert found == ["'37.5배'가 증거에 없음", "'120만원'가 증거에 없음", "'9건'가 증거에 없음"]


# "결제 5건"은 개수, "결제 9999"는 번호 — 사건 결제가 아닌 번호만 문제
def test_paymentNumberOutsideCase_isProblem() -> None:
    found = problems(draft(verdict=f"결제 {PAYMENT}과 결제 9999를 확인하세요. 결제 5건"))
    assert found == ["결제 9999은 이 사건 결제가 아님"]


# 받고도 출처로 쓰지 않은 창구는 알림만 (사건 결제 목록은 기본 정보라 빼고)
def test_unusedEvidence_reportedSeparately() -> None:
    d = draft(
        riskPoints=[{"title": "처음 쓰는 카드", "detail": "카드", "source": "get_fds_evidence"}]
    )
    result = check_grounding(d, EVIDENCE, [int(PAYMENT)])
    assert result.problems == []
    assert result.unused == ["get_payment_history"]


# 가짜 AI가 1번 지어내면 근거 검사가 잡고, 틀린 곳을 짚어 다시 물어 2차에 통과 (시연 옵션)
def test_ungroundedOnce_retriesAndPasses() -> None:
    llm = MockLlmClient(ungrounded_answers=1)
    service = InvestigationService(InvestigationAgent(llm), tools=FakeTools(history=True))
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.SUCCEEDED
    details = [s.detail for s in result.steps]
    assert "근거 검사 실패: '37.5배'가 증거에 없음 → 다시 시도" in details
    assert details[-1].startswith("근거 검사 통과")
    assert "37.5배" not in result.report.summary


# 3번 모두 지어내면 실패 — 지어낸 숫자가 직원 화면에 나가지 않는다 (Spring은 다시 맡기지 않음, #88)
def test_ungroundedThreeTimes_fails() -> None:
    llm = MockLlmClient(ungrounded_answers=3)
    service = InvestigationService(InvestigationAgent(llm), tools=FakeTools(history=True))
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.FAILED
    assert result.error.code == "LLM_INVALID_ANSWER"
    assert "근거 부족: '37.5배'가 증거에 없음" in result.error.reason
    assert result.steps[-1].detail == "근거 검사 실패: '37.5배'가 증거에 없음"
