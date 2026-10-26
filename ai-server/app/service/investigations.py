import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.agent.graph import InvestigationGraph
from app.agent.investigator import InvestigationAgent
from app.agent.tools import AttemptOutdated, ToolRunner
from app.client.spring import ResultNotifier
from app.schemas.investigation import (
    AcceptedResponse,
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


# 조사 작업 관리 — 접수 · 중복 방지 · 결과 보관 · 알림 (조사 흐름 자체는 그래프)
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
        self.graph = InvestigationGraph(agent, tools, max_llm_attempts, max_tool_calls, now)

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

    # 조사 흐름은 LangGraph 그래프가 돈다 (app/agent/graph.py, ADR-0021)
    async def _investigate(self, request: InvestigationRequest) -> InvestigationResult:
        state = await self.graph.run(request)
        if "report" in state:
            return self._result(
                request, InvestigationStatus.SUCCEEDED, state["steps"], report=state["report"]
            )
        return self._result(
            request, InvestigationStatus.FAILED, state["steps"], error=state["error"]
        )

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
