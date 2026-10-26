import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.agent.investigator import InvalidAnswer, InvestigationAgent
from app.agent.llm import LlmError
from app.agent.tools import TOOL_NAMES, TOOL_SPECS, AttemptOutdated, ToolRunner
from app.client.spring import ResultNotifier
from app.schemas.investigation import (
    AcceptedResponse,
    FailureInfo,
    InvestigationRequest,
    InvestigationResult,
    InvestigationStatus,
    TraceStep,
)

log = logging.getLogger(__name__)


@dataclass
class _Job:
    result: InvestigationResult
    started: bool = False


# 조사 작업 관리 — 접수 · 중복 방지 · 다시 묻기
# 작업은 메모리에만 둔다 (재시작하면 Spring이 조회 · 재시도로 복구)
class InvestigationService:
    def __init__(
        self,
        agent: InvestigationAgent,
        max_llm_attempts: int = 3,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        notifier: ResultNotifier | None = None,
        tools: ToolRunner | None = None,
        max_tool_calls: int = 8,
    ) -> None:
        self.agent = agent
        # Spring 증거 조회 창구 (#72). 없으면 AI가 창구 없이 바로 답한다
        self.tools = tools
        self.max_tool_calls = max_tool_calls
        # 조사가 끝나면 Spring에 결과를 보낸다 (없으면 조회로만 확인)
        self.notifier = notifier
        self.max_llm_attempts = max_llm_attempts
        self.now = now
        # reportId → 현재 시도 하나만 (ADR-0009: 현재 attemptId만 반영)
        self.jobs: dict[int, _Job] = {}

    # 같은 시도가 다시 오면 새로 돌리지 않는다. 새 attemptId면 이전 시도를 버리고 새로 시작한다
    def accept(self, request: InvestigationRequest) -> tuple[AcceptedResponse, bool]:
        current = self.jobs.get(request.report_id)
        is_new = current is None or current.result.attempt_id != request.attempt_id
        if is_new:
            self.jobs[request.report_id] = _Job(
                InvestigationResult(
                    report_id=request.report_id,
                    attempt_id=request.attempt_id,
                    case_id=request.case_id,
                    case_type=request.case_type,
                    evidence_version=request.evidence_version,
                    status=InvestigationStatus.RUNNING,
                )
            )
        accepted = AcceptedResponse(report_id=request.report_id, attempt_id=request.attempt_id)
        return accepted, is_new

    def find(self, report_id: int, attempt_id: UUID | None = None) -> InvestigationResult | None:
        job = self.jobs.get(report_id)
        if job is None or (attempt_id is not None and job.result.attempt_id != attempt_id):
            return None
        return job.result

    async def run(self, request: InvestigationRequest) -> None:
        job = self.jobs.get(request.report_id)
        if job is None or job.result.attempt_id != request.attempt_id or job.started:
            return
        job.started = True
        try:
            result = await self._investigate(request)
        except AttemptOutdated:
            # Spring이 이 시도를 이미 버렸다 (시간 초과 · 대체) — 결과를 남기지도 보내지도 않는다
            log.info("현재 시도가 아니라 조사를 멈춤 reportId=%s", request.report_id)
            return
        # 그사이 새 시도가 들어왔으면 이 결과는 버린다
        latest = self.jobs.get(request.report_id)
        if latest is None or latest.result.attempt_id != request.attempt_id:
            return
        latest.result = result
        if self.notifier is not None:
            await self.notifier.notify(result)

    async def _investigate(self, request: InvestigationRequest) -> InvestigationResult:
        specs = TOOL_SPECS if self.tools is not None else []
        steps: list[TraceStep] = []
        messages = self.agent.first_messages(request, with_tools=bool(specs))
        tool_calls = 0
        nudged = False
        last_reason = ""
        attempt = 0
        while attempt < self.max_llm_attempts:
            started, clock = self.now(), time.monotonic()
            try:
                reply = await self.agent.ask(messages, specs)
            except LlmError as e:
                steps.append(self._step("LLM_ANSWER", False, f"AI 호출 실패: {e}", started, clock))
                return self._failed(request, steps, "LLM_ERROR", str(e), attempt + 1)
            if reply.tool_calls and specs:
                if tool_calls + len(reply.tool_calls) <= self.max_tool_calls:
                    tool_calls += len(reply.tool_calls)
                    results = [
                        await self._call_tool(request, c.name, c.arguments)
                        for c in reply.tool_calls
                    ]
                    messages = self.agent.with_tool_results(messages, reply, results)
                    continue
                messages = self.agent.stop_calling(messages)
                if not nudged:
                    # 창구를 너무 많이 부르면 한 번 알린다. 그래도 부르면 형식이 틀린 답으로 센다
                    nudged = True
                    continue
                attempt += 1
                last_reason = f"창구를 {self.max_tool_calls}번 넘게 부름"
                retry = attempt < self.max_llm_attempts
                detail = f"구조 검증 실패: {last_reason}" + (" → 다시 시도" if retry else "")
                steps.append(self._step("VALIDATION", False, detail, started, clock))
                continue
            attempt += 1
            steps.append(self._step("LLM_ANSWER", True, f"AI 판단 ({attempt}차)", started, clock))

            started, clock = self.now(), time.monotonic()
            try:
                report = self.agent.parse(reply.content, request)
            except InvalidAnswer as invalid:
                last_reason = invalid.reason
                retry = attempt < self.max_llm_attempts
                detail = f"구조 검증 실패: {invalid.reason}" + (" → 다시 시도" if retry else "")
                steps.append(self._step("VALIDATION", False, detail, started, clock))
                messages = self.agent.correction(messages, invalid)
                continue
            steps.append(self._step("VALIDATION", True, "구조 검증 통과", started, clock))
            return self._result(request, InvestigationStatus.SUCCEEDED, steps, report=report)
        reason = f"{self.max_llm_attempts}번 모두 형식이 맞지 않음 (마지막: {last_reason})"
        return self._failed(request, steps, "LLM_INVALID_ANSWER", reason, self.max_llm_attempts)

    # 창구 하나를 부른다. 없는 창구 이름이면 Spring에 묻지 않고 AI에게 알린다
    # Spring 오류 · 연결 실패는 ToolRunner가 "조회 실패" 결과로 바꿔 준다 (조사는 계속)
    async def _call_tool(
        self, request: InvestigationRequest, name: str, args: dict[str, object]
    ) -> tuple[str, str]:
        if self.tools is None or name not in TOOL_NAMES:
            return name, json.dumps({"tool": name, "ready": False, "note": "없는 창구", "data": []})
        text = await self.tools.call(request.report_id, str(request.attempt_id), name, args)
        return name, text

    def _step(self, kind: str, ok: bool, detail: str, started: datetime, clock: float) -> TraceStep:
        elapsed = int((time.monotonic() - clock) * 1000)
        return TraceStep(kind=kind, ok=ok, detail=detail, started_at=started, duration_ms=elapsed)

    def _failed(
        self,
        request: InvestigationRequest,
        steps: list[TraceStep],
        code: str,
        reason: str,
        llm_attempts: int,
    ) -> InvestigationResult:
        error = FailureInfo(code=code, reason=reason, llm_attempts=llm_attempts)
        return self._result(request, InvestigationStatus.FAILED, steps, error=error)

    def _result(
        self,
        request: InvestigationRequest,
        status: InvestigationStatus,
        steps: list[TraceStep],
        **outcome: object,
    ) -> InvestigationResult:
        return InvestigationResult(
            report_id=request.report_id,
            attempt_id=request.attempt_id,
            case_id=request.case_id,
            case_type=request.case_type,
            evidence_version=request.evidence_version,
            status=status,
            steps=steps,
            **outcome,
        )
