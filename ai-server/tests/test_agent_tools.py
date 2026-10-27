import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from app.agent.investigator import InvestigationAgent
from app.agent.llm import LlmMessage, LlmReply, MockLlmClient, ToolCall
from app.agent.mock_answers import TOOL_PLAN
from app.agent.tools import AttemptOutdated, ToolSpec
from app.client.spring import SpringStepReporter, SpringToolClient
from app.schemas.investigation import InvestigationRequest, InvestigationStatus, TraceStep
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
    def __init__(
        self,
        score: int = 65,
        fail: set[str] | None = None,
        buyer: str | None = None,
        history: bool = False,
    ) -> None:
        self.history = history
        self.calls: list[str] = []
        self.score = score
        self.fail = fail or set()
        self.buyer = buyer

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
        if name == "get_order_context":
            row = {"paymentId": PAYMENT, "orderTitle": "케이크 세트", "buyerAnswer": self.buyer}
            return ok(name, [row])
        # 과거 결제 · 카드 창구 (#90) — history=True면 김민수 시연 데이터처럼
        if self.history and name == "get_payment_history":
            row = {
                "paymentId": PAYMENT,
                "capturedCount": 5,
                "capturedAverageAmount": 40_000,
                "amountToAverageRatio": 7.5,
                "capturedCountByCardLast4": {"4821": 5},
            }
            return ok(name, [row])
        if self.history and name == "get_payment_authentication":
            row = {"paymentId": PAYMENT, "cardLast4": "1173", "firstUseOfCard": True}
            return ok(name, [row])
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
    # 창구 호출 기록은 Spring이 정본 — ai-server 과정에는 AI 판단(물을 때마다) · 형식 검사만
    picks = len(TOOL_PLAN["PAYMENT_FRAUD"])
    assert [s.kind for s in result.steps] == ["LLM_ANSWER"] * (picks + 1) + ["VALIDATION"]
    assert [s.detail for s in result.steps[: picks + 1]] == [
        "AI 판단 — 다음에 볼 증거 고르기"
    ] * picks + ["AI 판단 — 보고서 작성 (1차)"]


# 과거 결제 · 카드 창구가 답하면 평소 금액 배수 · 처음 쓰는 카드를 근거로 쓴다 (#90)
def test_mockAgent_usesHistoryAndCard() -> None:
    report = investigate(FakeTools(history=True)).report

    # FakeTools의 FDS Rule은 NEW_CARD · HIGH_AMOUNT — 카드는 NEW_CARD 줄에 붙고, 금액 배수는 새 줄
    titles = [p.title for p in report.risk_points]
    assert titles == ["처음 쓰는 카드", "고액 결제", "평소의 7.5배 금액"]
    assert report.risk_points[0].detail.endswith("카드 1173로 결제를 끝낸 적이 없습니다")
    spike = next(p for p in report.risk_points if p.title == "평소의 7.5배 금액")
    assert spike.detail == "이전 완료 결제 5건 평균 40,000원, 카드 4821 5건 — 이번은 평균의 7.5배"
    assert spike.source == "get_payment_history"
    assert not any("과거 결제" in u or "카드 인증" in u for u in report.unknowns)


# FDS가 같은 Rule로 이미 잡았으면 줄을 늘리지 않고 그 줄에 자세한 내용을 붙인다
def test_mockAgent_mergesHistoryIntoMatchingRule() -> None:
    class SpikeTools(FakeTools):
        async def call(self, report_id: int, attempt_id: str, name: str, args: dict) -> str:
            if name == "get_fds_evidence":
                self.calls.append(name)
                row = {
                    "paymentId": PAYMENT,
                    "riskScore": 55,
                    "ruleHits": ["AMOUNT_SPIKE", "NEW_CARD"],
                }
                return ok(name, [row])
            return await super().call(report_id, attempt_id, name, args)

    report = investigate(SpikeTools(history=True)).report

    titles = [p.title for p in report.risk_points]
    assert titles == ["평소보다 큰 금액", "처음 쓰는 카드"]
    assert report.risk_points[0].detail.endswith(
        "평균 40,000원, 카드 4821 5건 — 이번은 평균의 7.5배"
    )
    assert report.risk_points[1].detail.endswith("이 고객이 카드 1173로 결제를 끝낸 적이 없습니다")


# 위험 점수가 높으면 승인 취소 검토를 권한다
def test_mockAgent_highScore_recommendsRejectReview() -> None:
    report = investigate(FakeTools(score=82)).report
    assert report.payment_advice[0].recommendation == "REJECT_REVIEW"
    assert "승인 취소 검토" in [r.label for r in report.recommendations]


# 구매자가 "결제하지 않았어요" → 위험이 오르고 승인 취소 검토 (#82, get_order_context)
def test_mockAgent_buyerDenied_recommendsReject() -> None:
    report = investigate(FakeTools(buyer="NOT_MINE")).report
    assert report.risk_score == 95
    assert report.verdict == "구매자가 결제하지 않았다고 답해 카드 도용 가능성이 높습니다"
    assert report.risk_points[0].source == "get_order_context"
    assert report.payment_advice[0].recommendation == "REJECT_REVIEW"
    assert [r.label for r in report.recommendations][0] == "승인 취소 검토"


# 구매자가 "제가 결제했어요" → 정상 정황으로 남기고 매입 허용 검토
def test_mockAgent_buyerConfirmed_recommendsAccept() -> None:
    report = investigate(FakeTools(buyer="MINE")).report
    assert report.risk_score == 45
    assert [p.title for p in report.normal_points] == ["구매자가 본인 결제라고 답함"]
    assert report.payment_advice[0].recommendation == "ACCEPT_REVIEW"


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
        async def complete(
            self, messages: list[LlmMessage], tools: list[ToolSpec], answer_schema: object = None
        ) -> LlmReply:
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
            self,
            messages: list[LlmMessage],
            tools: list[ToolSpec] | None = None,
            answer_schema: object = None,
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


# 단계가 끝날 때마다 Spring에 순서대로 알린다 — 화면이 조사 중에 한 줄씩 그린다 (2-19b)
def test_steps_reportedAsTheyFinish() -> None:
    class Collect:
        def __init__(self) -> None:
            self.details: list[str] = []

        async def report(self, report_id: int, attempt_id: str, step: object) -> None:
            self.details.append(step.detail)

    reporter = Collect()
    service = InvestigationService(
        InvestigationAgent(MockLlmClient(invalid_answers=1)), tools=FakeTools(), reporter=reporter
    )
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.SUCCEEDED
    assert reporter.details == [s.detail for s in result.steps]
    assert reporter.details[-3:] == [
        "구조 검증 실패: 필수 항목 '확인할 것' 누락 → 다시 시도",
        "AI 판단 — 보고서 작성 (2차)",
        "구조 검증 통과",
    ]


# 단계 알리기: 시도 · 단계 칸을 싣고, 409는 멈춤, 다른 오류 · 연결 실패는 무시하고 계속
def test_springStepReporter_statuses() -> None:
    seen: list[httpx.Request] = []
    replies = iter([httpx.Response(204), httpx.Response(500), httpx.Response(409)])

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return next(replies)

    reporter = SpringStepReporter("http://spring", "key", transport=httpx.MockTransport(handler))
    step = TraceStep(
        kind="LLM_ANSWER", ok=True, detail="AI 판단", started_at=datetime.now(UTC), duration_ms=5
    )

    async def scenario() -> None:
        await reporter.report(3, "a", step)
        await reporter.report(3, "a", step)
        with pytest.raises(AttemptOutdated):
            await reporter.report(3, "a", step)

    asyncio.run(scenario())
    assert str(seen[0].url) == "http://spring/internal/ai/reports/3/steps"
    body = json.loads(seen[0].content)
    assert body["attemptId"] == "a" and body["kind"] == "LLM_ANSWER" and body["durationMs"] == 5
