import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.agent.investigator import InvalidAnswer, InvestigationAgent
from app.agent.llm import LlmError
from app.schemas.investigation import (
    AcceptedResponse,
    FailureInfo,
    InvestigationRequest,
    InvestigationResult,
    InvestigationStatus,
    TraceStep,
)


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
    ) -> None:
        self.agent = agent
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
        result = await self._investigate(request)
        # 그사이 새 시도가 들어왔으면 이 결과는 버린다
        latest = self.jobs.get(request.report_id)
        if latest is not None and latest.result.attempt_id == request.attempt_id:
            latest.result = result

    async def _investigate(self, request: InvestigationRequest) -> InvestigationResult:
        steps: list[TraceStep] = []
        messages = self.agent.first_messages(request)
        last_reason = ""
        for attempt in range(1, self.max_llm_attempts + 1):
            started, clock = self.now(), time.monotonic()
            try:
                raw = await self.agent.ask(messages)
            except LlmError as e:
                steps.append(self._step("LLM_ANSWER", False, f"AI 호출 실패: {e}", started, clock))
                return self._failed(request, steps, "LLM_ERROR", str(e), attempt)
            steps.append(self._step("LLM_ANSWER", True, f"AI 판단 ({attempt}차)", started, clock))

            started, clock = self.now(), time.monotonic()
            try:
                report = self.agent.parse(raw)
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
            evidence_version=request.evidence_version,
            status=status,
            steps=steps,
            **outcome,
        )
