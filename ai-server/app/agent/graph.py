import json
import time
from collections.abc import Callable
from datetime import datetime
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agent.grounding import TOOL_LABELS, check_grounding
from app.agent.investigator import InvalidAnswer, InvestigationAgent
from app.agent.llm import LlmError, LlmMessage, LlmReply, ToolCall
from app.agent.tools import (
    FINISH_EVIDENCE,
    TOOL_NAMES,
    TOOL_SPECS,
    StepReporter,
    ToolRunner,
)
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
    # 형식 검사를 통과한 초안 — 근거 검사까지 통과해야 report가 된다 (#92)
    draft: ReportDraft | None
    # AI가 증거 수집 끝(finish_evidence)을 불렀다 — 다음 질문부터 형식 고정 (#94)
    evidence_done: bool
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
        # 창구가 있을 때만 증거 수집 끝 신호도 준다 (#94)
        self.specs = [*TOOL_SPECS, FINISH_EVIDENCE] if tools is not None else []
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
        builder.add_node("ground", self._ground)
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
            {"형식_통과": "ground", "형식_틀림_다시": "ask_ai", "3번_모두_실패": "give_up"},
        )
        builder.add_conditional_edges(
            "ground",
            self._after_ground,
            {"통과": END, "근거_부족_다시": "ask_ai", "3번_모두_실패": "give_up"},
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
            "evidence_done": False,
        }
        # 한 바퀴마다 노드 두 개 안팎 — 창구 · 다시 묻기 최대치를 다 써도 멈추지 않을 만큼
        limit = 4 * (self.max_tool_calls + self.max_llm_attempts) + 10
        return await self.graph.ainvoke(start, {"recursion_limit": limit})

    # ── 노드 ──

    # AI에게 한 번 물을 때마다 단계 하나 — 창구를 고른 판단도 보고서를 쓴 판단도 보인다 (2-19b)
    # 형식이 한 번 틀린 뒤로는 창구 없이 보고서 모양을 고정해 묻는다 (#88) — 증거는 이미 대화에 있다
    async def _ask_ai(self, state: InvestigationState) -> InvestigationState:
        asked_at, clock = self.now(), time.monotonic()
        locked = self._locked(state)
        tools = [] if locked else self.specs
        schema = answer_schema(state["request"].case_type) if locked else None
        try:
            reply = await self.agent.ask(state["messages"], tools, schema)
        except LlmError as e:
            step = self._step("LLM_ANSWER", False, f"AI 호출 실패: {e}", asked_at, clock)
            await self._report(state, step)
            error = FailureInfo(code="LLM_ERROR", reason=str(e), llm_attempts=state["attempt"] + 1)
            return {"steps": [*state["steps"], step], "error": error}
        if reply.tool_calls and tools and not _evidence_calls(reply.tool_calls):
            detail = "AI 판단 — 증거 수집 끝"
        elif reply.tool_calls and tools:
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
        done = state["evidence_done"]
        for call in reply.tool_calls:
            # 증거 수집 끝 — Spring에 묻지 않고 대화에만 답을 붙인다 (호출마다 답이 있어야 함)
            if call.name == FINISH_EVIDENCE.name:
                done = True
                note = "증거 수집 끝 — 이제 받은 증거로 보고서 JSON을 씁니다"
                body = {"tool": call.name, "ready": True, "note": note, "data": []}
                results.append((call.name, json.dumps(body, ensure_ascii=False)))
                continue
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
            "tool_calls": state["tool_calls"] + len(_evidence_calls(reply.tool_calls)),
            "evidence_done": done,
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
                "draft": None,
                "last_reason": invalid.reason,
                "steps": [*state["steps"], failed],
                "messages": self.agent.correction(state["messages"], invalid),
            }
        passed = self._step("VALIDATION", True, "구조 검증 통과", checked_at, clock)
        await self._report(state, passed)
        return {"attempt": attempt, "draft": report, "steps": [*state["steps"], passed]}

    # 근거 검사 (#92) — 출처 · 숫자 · 결제 번호가 받은 증거에 있는지. 틀린 곳을 짚어 다시 쓰게 한다
    # 시도 횟수는 형식 검사와 같은 3번 안에서 센다 (validate가 이미 셌다)
    async def _ground(self, state: InvestigationState) -> InvestigationState:
        draft = state["draft"]
        # 창구 없이 조사했으면(Spring 주소 없음 · 단독 실행) 비교할 증거가 없어 검사하지 않는다
        if self.tools is None:
            return {"report": draft}
        checked_at, clock = self.now(), time.monotonic()
        checked = check_grounding(draft, state["messages"], state["request"].payment_ids)
        if checked.problems:
            reason = ", ".join(checked.problems[:3])
            retry = state["attempt"] < self.max_llm_attempts
            detail = f"근거 검사 실패: {reason}" + (" → 다시 시도" if retry else "")
            failed = self._step("VALIDATION", False, detail, checked_at, clock)
            await self._report(state, failed)
            raw = state["reply"].content
            return {
                "draft": None,
                "last_reason": f"근거 부족: {reason}",
                "steps": [*state["steps"], failed],
                "messages": self.agent.grounding_correction(
                    state["messages"], raw, checked.problems
                ),
            }
        detail = "근거 검사 통과"
        if checked.unused:
            names = ", ".join(TOOL_LABELS.get(name, name) for name in checked.unused)
            detail += f" · 받고도 안 쓴 증거: {names}"
        passed = self._step("VALIDATION", True, detail, checked_at, clock)
        await self._report(state, passed)
        return {"report": draft, "steps": [*state["steps"], passed]}

    async def _give_up(self, state: InvestigationState) -> InvestigationState:
        last = state["last_reason"]
        reason = f"{self.max_llm_attempts}번 모두 보고서 검사를 통과하지 못함 (마지막: {last})"
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
            # 형식 고정으로 물은 뒤엔 창구를 안 줬다 — 그래도 부르면 "너무 많이"로 센다
            asked = len(_evidence_calls(reply.tool_calls))
            within = state["tool_calls"] + asked <= self.max_tool_calls
            within = within and not self._locked(state)
            return "창구_요청" if within else "창구_너무_많음"
        return "보고서_작성"

    # 알리기만 했거나 형식 실패로 셌어도 시도가 남았으면 다시 묻고, 다 썼으면 포기
    def _after_too_many(self, state: InvestigationState) -> Literal["다시_묻기", "3번_모두_실패"]:
        return "3번_모두_실패" if state["attempt"] >= self.max_llm_attempts else "다시_묻기"

    def _after_validate(
        self, state: InvestigationState
    ) -> Literal["형식_통과", "형식_틀림_다시", "3번_모두_실패"]:
        if state.get("draft") is not None:
            return "형식_통과"
        return "3번_모두_실패" if state["attempt"] >= self.max_llm_attempts else "형식_틀림_다시"

    def _after_ground(
        self, state: InvestigationState
    ) -> Literal["통과", "근거_부족_다시", "3번_모두_실패"]:
        if "report" in state:
            return "통과"
        return "3번_모두_실패" if state["attempt"] >= self.max_llm_attempts else "근거_부족_다시"

    # ── 도움 ──

    # 형식이 한 번 틀렸거나(#88) 증거 수집 끝을 불렀으면(#94) 창구 없이 보고서 모양을 고정
    @staticmethod
    def _locked(state: InvestigationState) -> bool:
        return state["attempt"] > 0 or state.get("evidence_done", False)

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


# 진짜 증거 창구 호출만 (증거 수집 끝 신호 제외) — 창구 횟수는 이것만 센다
def _evidence_calls(calls: list[ToolCall]) -> list[ToolCall]:
    return [call for call in calls if call.name != FINISH_EVIDENCE.name]
