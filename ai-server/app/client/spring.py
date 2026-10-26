import json
import logging
from typing import Protocol

import httpx

from app.agent.tools import AttemptOutdated
from app.schemas.investigation import InvestigationResult, TraceStep

log = logging.getLogger(__name__)


# 조사 결과를 Spring에 알리는 경계 — 테스트는 가짜로 바꿔 끼운다
class ResultNotifier(Protocol):
    async def notify(self, result: InvestigationResult) -> bool: ...


# Spring /internal/ai/reports/{reportId}/result 로 결과를 보낸다 (ADR-0009 결정 1)
# 보내기 실패는 기록만 한다. Spring이 GET /investigations/{reportId}로 다시 물어 복구한다 (2-18)
class SpringResultNotifier:
    def __init__(
        self,
        base_url: str,
        service_key: str,
        timeout_seconds: float = 5.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def notify(self, result: InvestigationResult) -> bool:
        url = f"{self.base_url}/internal/ai/reports/{result.report_id}/result"
        body = result.model_dump(by_alias=True, mode="json")
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self.transport
            ) as client:
                response = await client.post(
                    url, json=body, headers={"X-Service-Key": self.service_key}
                )
        except httpx.HTTPError as e:
            log.warning("결과 보내기 실패 reportId=%s: %s", result.report_id, e)
            return False
        if response.status_code >= 300:
            log.warning(
                "Spring이 결과를 받지 않음 reportId=%s status=%s",
                result.report_id,
                response.status_code,
            )
            return False
        return True


# Spring 증거 조회 창구 /internal/ai/tools/{name} (ADR-0009 Tool 표, #70 · #72)
# 409(현재 시도 아님)는 조사를 멈추게 알리고, 다른 오류 · 연결 실패는 "조회 실패" 결과로 이어 간다
class SpringToolClient:
    def __init__(
        self,
        base_url: str,
        service_key: str,
        timeout_seconds: float = 5.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def call(
        self, report_id: int, attempt_id: str, name: str, args: dict[str, object]
    ) -> str:
        url = f"{self.base_url}/internal/ai/tools/{name}"
        body = {"reportId": report_id, "attemptId": attempt_id, "args": args}
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self.transport
            ) as client:
                response = await client.post(
                    url, json=body, headers={"X-Service-Key": self.service_key}
                )
        except httpx.HTTPError as e:
            log.warning("창구 호출 실패 reportId=%s tool=%s: %s", report_id, name, e)
            return _lookup_failed(name)
        if response.status_code == 409:
            raise AttemptOutdated(f"reportId={report_id} attemptId={attempt_id}")
        if response.status_code >= 300:
            log.warning(
                "창구 오류 reportId=%s tool=%s status=%s", report_id, name, response.status_code
            )
            return _lookup_failed(name)
        return response.text


def _lookup_failed(name: str) -> str:
    return json.dumps(
        {"tool": name, "ready": False, "note": "조회 실패", "data": []}, ensure_ascii=False
    )


# Spring /internal/ai/reports/{reportId}/steps — AI 판단 · 형식 검사가 끝날 때마다 알린다 (2-19b)
# 단계는 보여 주기용이라 실패해도 기록만 하고 조사를 이어 간다. 409(현재 시도 아님)면 조사를 멈춘다
class SpringStepReporter:
    def __init__(
        self,
        base_url: str,
        service_key: str,
        timeout_seconds: float = 3.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def report(self, report_id: int, attempt_id: str, step: TraceStep) -> None:
        url = f"{self.base_url}/internal/ai/reports/{report_id}/steps"
        body = {"attemptId": attempt_id, **step.model_dump(by_alias=True, mode="json")}
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self.transport
            ) as client:
                response = await client.post(
                    url, json=body, headers={"X-Service-Key": self.service_key}
                )
        except httpx.HTTPError as e:
            log.warning("단계 알리기 실패 reportId=%s: %s", report_id, e)
            return
        if response.status_code == 409:
            raise AttemptOutdated(f"reportId={report_id} attemptId={attempt_id}")
        if response.status_code >= 300:
            log.warning(
                "Spring이 단계를 받지 않음 reportId=%s status=%s", report_id, response.status_code
            )
