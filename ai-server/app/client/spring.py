import logging
from typing import Protocol

import httpx

from app.schemas.investigation import InvestigationResult

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
