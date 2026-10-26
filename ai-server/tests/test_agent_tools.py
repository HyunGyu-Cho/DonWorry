import asyncio
import json
from uuid import uuid4

import httpx
import pytest

from app.agent.investigator import InvestigationAgent
from app.agent.llm import LlmMessage, LlmReply, MockLlmClient, ToolCall
from app.agent.mock_answers import TOOL_PLAN
from app.agent.tools import AttemptOutdated, ToolSpec
from app.client.spring import SpringToolClient
from app.schemas.investigation import InvestigationRequest, InvestigationStatus
from app.service.investigations import InvestigationService

PAYMENT = "9001"


def request(case_type: str = "PAYMENT_FRAUD") -> InvestigationRequest:
    return InvestigationRequest.model_validate(
        {
            "reportId": 1,
            "attemptId": str(uuid4()),
            "caseId": 201,
            "caseType": case_type,
            "evidenceVersion": 1,
            "paymentIds": [int(PAYMENT)] if case_type == "PAYMENT_FRAUD" else [],
        }
    )


def ok(tool: str, data: list[dict[str, object]]) -> str:
    return json.dumps({"tool": tool, "ready": True, "note": None, "data": data})


def not_ready(tool: str, note: str = "데이터 준비 전") -> str:
    return json.dumps({"tool": tool, "ready": False, "note": note, "data": []})


# Spring 창구 대신 — 부른 순서를 기록하고 정해 둔 증거를 돌려준다
class FakeTools:
    def __init__(self, score: int = 65, fail: set[str] | None = None) -> None:
        self.calls: list[str] = []
        self.score = score
        self.fail = fail or set()

    async def call(
        self, report_id: int, attempt_id: str, name: str, args: dict[str, object]
    ) -> str:
        self.calls.append(name)
        if name in self.fail:
            return not_ready(name, "조회 실패")
        if name == "get_fds_evidence":
            rules = ["NEW_CARD", "HIGH_AMOUNT"]
            return ok(name, [{"paymentId": PAYMENT, "riskScore": self.score, "ruleHits": rules}])
        if name == "get_case_payments":
            return ok(name, [{"paymentId": PAYMENT, "amount": 300_000, "paymentStatus": "HELD"}])
        return not_ready(name)


def investigate(tools: object, req: InvestigationRequest | None = None, **kwargs: object):
    service = InvestigationService(InvestigationAgent(MockLlmClient()), tools=tools, **kwargs)
    return asyncio.run(service._investigate(req or request()))


# 가짜 AI는 정해진 순서로 창구를 부르고, 받은 증거(적중 규칙 · 금액 · 결제 번호)로 보고서를 쓴다
def test_mockAgent_callsToolsInOrder_andWritesFromEvidence() -> None:
    tools = FakeTools()
    result = investigate(tools)

    assert tools.calls == TOOL_PLAN["PAYMENT_FRAUD"]
    assert result.status == InvestigationStatus.SUCCEEDED
    report = result.report
    assert report.risk_score == 65
    assert [p.title for p in report.risk_points] == ["처음 쓰는 카드", "고액 결제"]
    assert report.risk_points[0].detail == "결제 1 (300,000원) · 65점"
    assert "300,000원" in report.summary
    assert [a.payment_id for a in report.payment_advice] == [PAYMENT]
    assert report.payment_advice[0].recommendation == "NEEDS_CHECK"
    assert "이 고객의 과거 결제 패턴 (데이터 준비 전)" in report.unknowns
    # 창구 호출 기록은 Spring이 정본 — ai-server 과정에는 AI 판단 · 형식 검사만
    assert [s.kind for s in result.steps] == ["LLM_ANSWER", "VALIDATION"]


# 위험 점수가 높으면 승인 취소 검토를 권한다
def test_mockAgent_highScore_recommendsRejectReview() -> None:
    report = investigate(FakeTools(score=82)).report
    assert report.payment_advice[0].recommendation == "REJECT_REVIEW"
    assert "승인 취소 검토" in [r.label for r in report.recommendations]


# 창구가 오류를 내도 조사는 끝까지 가고, 그 내용은 모르는 것으로 남는다
def test_toolFailure_becomesUnknown() -> None:
    result = investigate(FakeTools(fail={"get_payment_history"}))
    assert result.status == InvestigationStatus.SUCCEEDED
    assert "이 고객의 과거 결제 패턴 (조회 실패)" in result.report.unknowns


# 직원 사건은 보안 이벤트 · 비슷한 사건 창구를 부르고, 데이터가 없으면 모르는 것에 적는다
def test_staffCase_callsSecurityEvents() -> None:
    tools = FakeTools()
    result = investigate(tools, request("STAFF_TAKEOVER"))
    assert tools.calls == ["get_security_events", "find_similar_cases"]
    assert result.status == InvestigationStatus.SUCCEEDED
    assert "로그인 · 기기 기록 (데이터 준비 전)" in result.report.unknowns


# Spring이 "현재 시도 아님"(409)이라고 하면 조사를 멈추고 결과를 남기지 않는다
def test_attemptOutdated_stopsWithoutResult() -> None:
    class OutdatedTools(FakeTools):
        async def call(self, *args: object) -> str:
            raise AttemptOutdated("old")

    service = InvestigationService(InvestigationAgent(MockLlmClient()), tools=OutdatedTools())
    req = request()
    service.accept(req)
    asyncio.run(service.run(req))

    assert service.find(req.report_id).status == InvestigationStatus.RUNNING


# 창구를 너무 많이 부르면 한 번 알리고, 그래도 부르면 형식 실패로 세어 끝내 실패
def test_tooManyToolCalls_nudgesThenFails() -> None:
    class Greedy:
        async def complete(self, messages: list[LlmMessage], tools: list[ToolSpec]) -> LlmReply:
            return LlmReply(tool_calls=[ToolCall(name="get_case_payments")])

    service = InvestigationService(
        InvestigationAgent(Greedy()), tools=FakeTools(), max_tool_calls=2
    )
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.FAILED
    assert result.error.code == "LLM_INVALID_ANSWER"
    assert "창구를 2번 넘게 부름" in result.error.reason


# AI가 없는 창구 이름을 대면 Spring에 묻지 않고 "없는 창구"로 알린다
def test_unknownToolName_notSentToSpring() -> None:
    class Wanders(MockLlmClient):
        async def complete(
            self, messages: list[LlmMessage], tools: list[ToolSpec] | None = None
        ) -> LlmReply:
            if not any(m.role == "tool" for m in messages):
                return LlmReply(tool_calls=[ToolCall(name="delete_payment")])
            return await super().complete(messages, tools)

    tools = FakeTools()
    service = InvestigationService(InvestigationAgent(Wanders()), tools=tools)
    result = asyncio.run(service._investigate(request()))

    assert "delete_payment" not in tools.calls
    assert result.status == InvestigationStatus.SUCCEEDED


# Spring 창구 호출: 키 · 보고서 · 시도 · 입력을 싣고, 409는 멈춤, 다른 오류 · 연결 실패는 조회 실패
def test_springToolClient_statuses() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        name = req.url.path.rsplit("/", 1)[-1]
        if name == "get_case_payments":
            return httpx.Response(200, text=ok(name, []))
        if name == "get_fds_evidence":
            return httpx.Response(409)
        if name == "get_order_context":
            raise httpx.ConnectError("down")
        return httpx.Response(500)

    client = SpringToolClient("http://spring", "key", transport=httpx.MockTransport(handler))

    async def scenario() -> None:
        assert json.loads(await client.call(1, "a", "get_case_payments", {}))["ready"] is True
        with pytest.raises(AttemptOutdated):
            await client.call(1, "a", "get_fds_evidence", {"paymentIds": ["9001"]})
        for name in ("get_payment_history", "get_order_context"):
            failed = json.loads(await client.call(1, "a", name, {}))
            assert failed == {"tool": name, "ready": False, "note": "조회 실패", "data": []}

    asyncio.run(scenario())
    first = seen[0]
    assert str(first.url) == "http://spring/internal/ai/tools/get_case_payments"
    assert first.headers["X-Service-Key"] == "key"
    assert json.loads(first.content) == {"reportId": 1, "attemptId": "a", "args": {}}
    assert json.loads(seen[1].content)["args"] == {"paymentIds": ["9001"]}
