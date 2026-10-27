import json
import time
from collections.abc import Callable
from datetime import datetime
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agent.investigator import InvalidAnswer, InvestigationAgent
from app.agent.llm import LlmError, LlmMessage, LlmReply
from app.agent.tools import TOOL_NAMES, TOOL_SPECS, StepReporter, ToolRunner
from app.schemas.investigation import FailureInfo, InvestigationRequest, TraceStep
from app.schemas.report import ReportDraft, answer_schema


# 조사 한 번의 상태 — 노드는 바뀐 칸만 돌려주고 LangGraph가 덮어쓴다 (체크포인트 없이 메모리에만)
class InvestigationState(TypedDict, total=False):
    request: InvestigationRequest
    messages: list[LlmMessage]
    reply: LlmReply
    steps: list[TraceStep]
    tool_calls: int
    nudged: bool
    attempt: int
    last_reason: str
    report: ReportDraft
    error: FailureInfo


# AI 조사 흐름 (ADR-0021) — 노드 = 할 일, 화살표 = 다음에 어디로 (화살표 이름은 그림에도 나온다)
#   ask_ai ─창구 요청─▶ call_tools ─▶ ask_ai          (한 시도 최대 max_tool_calls번)
#   ask_ai ─너무 많이─▶ too_many_tools ─▶ ask_ai | give_up   (한 번 알리고, 그래도면 형식 실패)
#   ask_ai ─보고서─▶ validate ─통과─▶ 끝 | ─틀림─▶ ask_ai | give_up   (최대 max_llm_attempts번)
# AI 호출은 LlmClient 경계(agent)로만, 창구는 ToolRunner로만 (AGENTS 6절)
class InvestigationGraph:
    def __init__(
        self,
        agent: InvestigationAgent,
        tools: ToolRunner | None,
        reporter: StepReporter | None,
        max_llm_attempts: int,
        max_tool_calls: int,
        now: Callable[[], datetime],
    ) -> None:
        self.agent = agent
        self.tools = tools
        # 조사 단계 알림 (2-19b) — 화면이 조사 중에 단계를 그린다
        self.reporter = reporter
        self.specs = TOOL_SPECS if tools is not None else []
        self.max_llm_attempts = max_llm_attempts
        self.max_tool_calls = max_tool_calls
        self.now = now
        self.graph = self._build()

    def _build(self) -> CompiledStateGraph:
        builder = StateGraph(InvestigationState)
        builder.add_node("ask_ai", self._ask_ai)
        builder.add_node("call_tools", self._call_tools)
        builder.add_node("too_many_tools", self._too_many_tools)
        builder.add_node("validate", self._validate)
        builder.add_node("give_up", self._give_up)
        builder.add_edge(START, "ask_ai")
        builder.add_conditional_edges(
            "ask_ai",
            self._after_ask,
            {
                "창구_요청": "call_tools",
                "창구_너무_많음": "too_many_tools",
                "보고서_작성": "validate",
                "AI_호출_실패": END,
            },
        )
        builder.add_edge("call_tools", "ask_ai")
        builder.add_conditional_edges(
            "too_many_tools",
            self._after_too_many,
            {"다시_묻기": "ask_ai", "3번_모두_실패": "give_up"},
        )
        builder.add_conditional_edges(
            "validate",
            self._after_validate,
            {"통과": END, "형식_틀림_다시": "ask_ai", "3번_모두_실패": "give_up"},
        )
        builder.add_edge("give_up", END)
        return builder.compile()

    # 조사 흐름 그림 (Mermaid) — docs/ai-server/investigation-graph.md와 같아야 한다 (테스트가 확인)
    def mermaid(self) -> str:
        return self.graph.get_graph().draw_mermaid()

    async def run(self, request: InvestigationRequest) -> InvestigationState:
        start: InvestigationState = {
            "request": request,
            "messages": self.agent.first_messages(request, with_tools=bool(self.specs)),
            "steps": [],
            "tool_calls": 0,
            "nudged": False,
            "attempt": 0,
            "last_reason": "",
        }
        # 한 바퀴마다 노드 두 개 안팎 — 창구 · 다시 묻기 최대치를 다 써도 멈추지 않을 만큼
        limit = 4 * (self.max_tool_calls + self.max_llm_attempts) + 10
        return await self.graph.ainvoke(start, {"recursion_limit": limit})

    # ── 노드 ──

    # AI에게 한 번 물을 때마다 단계 하나 — 창구를 고른 판단도 보고서를 쓴 판단도 보인다 (2-19b)
    # 형식이 한 번 틀린 뒤로는 창구 없이 보고서 모양을 고정해 묻는다 (#88) — 증거는 이미 대화에 있다
    async def _ask_ai(self, state: InvestigationState) -> InvestigationState:
        asked_at, clock = self.now(), time.monotonic()
        locked = state["attempt"] > 0
        tools = [] if locked else self.specs
        schema = answer_schema(state["request"].case_type) if locked else None
        try:
            reply = await self.agent.ask(state["messages"], tools, schema)
        except LlmError as e:
            step = self._step("LLM_ANSWER", False, f"AI 호출 실패: {e}", asked_at, clock)
            await self._report(state, step)
            error = FailureInfo(code="LLM_ERROR", reason=str(e), llm_attempts=state["attempt"] + 1)
            return {"steps": [*state["steps"], step], "error": error}
        if reply.tool_calls and tools:
            detail = "AI 판단 — 다음에 볼 증거 고르기"
        else:
            detail = f"AI 판단 — 보고서 작성 ({state['attempt'] + 1}차)"
        step = self._step("LLM_ANSWER", True, detail, asked_at, clock)
        await self._report(state, step)
        return {"reply": reply, "steps": [*state["steps"], step]}

    # 창구 하나씩 부른다. 없는 창구 이름은 Spring에 묻지 않는다
    # 409(현재 시도 아님)는 AttemptOutdated로 그래프 밖까지 올라가 조사를 멈춘다
    async def _call_tools(self, state: InvestigationState) -> InvestigationState:
        reply = state["reply"]
        request = state["request"]
        results = []
        for call in reply.tool_calls:
            if self.tools is None or call.name not in TOOL_NAMES:
                missing = {"tool": call.name, "ready": False, "note": "없는 창구", "data": []}
                results.append((call.name, json.dumps(missing)))
                continue
            text = await self.tools.call(
                request.report_id, str(request.attempt_id), call.name, call.arguments
            )
            results.append((call.name, text))
        return {
            "messages": self.agent.with_tool_results(state["messages"], reply, results),
            "tool_calls": state["tool_calls"] + len(reply.tool_calls),
        }

    # 창구를 너무 많이 부르면 한 번 알린다. 그래도 부르면 형식이 틀린 답으로 센다
    async def _too_many_tools(self, state: InvestigationState) -> InvestigationState:
        messages = self.agent.stop_calling(state["messages"])
        if not state["nudged"]:
            return {"messages": messages, "nudged": True}
        attempt = state["attempt"] + 1
        reason = f"창구를 {self.max_tool_calls}번 넘게 부름"
        detail = self._invalid_detail(reason, attempt)
        step = self._step("VALIDATION", False, detail, self.now(), time.monotonic())
        await self._report(state, step)
        return {
            "messages": messages,
            "attempt": attempt,
            "last_reason": reason,
            "steps": [*state["steps"], step],
        }

    async def _validate(self, state: InvestigationState) -> InvestigationState:
        attempt = state["attempt"] + 1
        checked_at, clock = self.now(), time.monotonic()
        try:
            report = self.agent.parse(state["reply"].content, state["request"])
        except InvalidAnswer as invalid:
            detail = self._invalid_detail(invalid.reason, attempt)
            failed = self._step("VALIDATION", False, detail, checked_at, clock)
            await self._report(state, failed)
            return {
                "attempt": attempt,
                "last_reason": invalid.reason,
                "steps": [*state["steps"], failed],
                "messages": self.agent.correction(state["messages"], invalid),
            }
        passed = self._step("VALIDATION", True, "구조 검증 통과", checked_at, clock)
        await self._report(state, passed)
        return {"attempt": attempt, "report": report, "steps": [*state["steps"], passed]}

    async def _give_up(self, state: InvestigationState) -> InvestigationState:
        reason = f"{self.max_llm_attempts}번 모두 형식이 맞지 않음 (마지막: {state['last_reason']})"
        error = FailureInfo(
            code="LLM_INVALID_ANSWER", reason=reason, llm_attempts=self.max_llm_attempts
        )
        return {"error": error}

    # ── 화살표 ──

    def _after_ask(
        self, state: InvestigationState
    ) -> Literal["창구_요청", "창구_너무_많음", "보고서_작성", "AI_호출_실패"]:
        if "error" in state:
            return "AI_호출_실패"
        reply = state["reply"]
        if reply.tool_calls and self.specs:
            # 형식 고정으로 물은 뒤(attempt > 0)엔 창구를 안 줬다 — 그래도 부르면 "너무 많이"로 센다
            within = state["tool_calls"] + len(reply.tool_calls) <= self.max_tool_calls
            within = within and state["attempt"] == 0
            return "창구_요청" if within else "창구_너무_많음"
        return "보고서_작성"

    # 알리기만 했거나 형식 실패로 셌어도 시도가 남았으면 다시 묻고, 다 썼으면 포기
    def _after_too_many(self, state: InvestigationState) -> Literal["다시_묻기", "3번_모두_실패"]:
        return "3번_모두_실패" if state["attempt"] >= self.max_llm_attempts else "다시_묻기"

    def _after_validate(
        self, state: InvestigationState
    ) -> Literal["통과", "형식_틀림_다시", "3번_모두_실패"]:
        if "report" in state:
            return "통과"
        return "3번_모두_실패" if state["attempt"] >= self.max_llm_attempts else "형식_틀림_다시"

    # ── 도움 ──

    # 끝난 단계를 Spring에 알린다 — 알릴 곳이 없으면(Spring 주소 없음) 건너뛴다
    async def _report(self, state: InvestigationState, step: TraceStep) -> None:
        if self.reporter is None:
            return
        request = state["request"]
        await self.reporter.report(request.report_id, str(request.attempt_id), step)

    def _invalid_detail(self, reason: str, attempt: int) -> str:
        retry = attempt < self.max_llm_attempts
        return f"구조 검증 실패: {reason}" + (" → 다시 시도" if retry else "")

    @staticmethod
    def _step(kind: str, ok: bool, detail: str, started: datetime, clock: float) -> TraceStep:
        elapsed = int((time.monotonic() - clock) * 1000)
        return TraceStep(kind=kind, ok=ok, detail=detail, started_at=started, duration_ms=elapsed)
