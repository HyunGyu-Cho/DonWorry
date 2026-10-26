import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from app.client.spring import SpringResultNotifier
from app.config import Settings
from app.main import create_app
from app.schemas.investigation import InvestigationResult

KEY = "test-service-key"
HEADERS = {"X-Service-Key": KEY}


def request_body(report_id: int = 5) -> dict[str, object]:
    return {
        "reportId": report_id,
        "attemptId": "00000000-0000-0000-0000-000000000005",
        "caseId": 201,
        "caseType": "PAYMENT_FRAUD",
        "evidenceVersion": 1,
    }


# Spring 대신 받은 요청을 모아 두는 가짜 서버
class FakeSpring:
    def __init__(self, status: int = 204, fail: bool = False) -> None:
        self.requests: list[httpx.Request] = []
        self.status = status
        self.fail = fail

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.fail:
            raise httpx.ConnectError("Spring 꺼짐", request=request)
        return httpx.Response(self.status)


def app_with(spring: FakeSpring) -> TestClient:
    notifier = SpringResultNotifier(
        "http://spring:8081/", KEY, transport=httpx.MockTransport(spring)
    )
    return TestClient(create_app(Settings(_env_file=None, service_key=KEY), notifier=notifier))


# 조사가 끝나면 Spring 결과 주소로 보낸다 — 서비스 키와 결과 본문(camelCase)이 실린다
def test_run_finished_notifiesSpring() -> None:
    spring = FakeSpring()
    app_with(spring).post("/investigations", json=request_body(), headers=HEADERS)

    assert len(spring.requests) == 1
    sent = spring.requests[0]
    assert str(sent.url) == "http://spring:8081/internal/ai/reports/5/result"
    assert sent.headers["X-Service-Key"] == KEY
    body = json.loads(sent.content)
    assert body["status"] == "SUCCEEDED"
    assert body["attemptId"] == "00000000-0000-0000-0000-000000000005"
    assert body["report"]["reportType"] == "PAYMENT_FRAUD"
    assert [s["detail"] for s in body["steps"]][-1] == "구조 검증 통과"


# Spring이 꺼져 있거나 받지 않아도 조사 결과는 ai-server에 남는다 — 나중에 조회로 가져갈 수 있다
def test_notify_springDownOrRejected_keepsResult() -> None:
    for spring in (FakeSpring(fail=True), FakeSpring(status=500)):
        c = app_with(spring)
        c.post("/investigations", json=request_body(), headers=HEADERS)

        assert len(spring.requests) == 1
        assert c.get("/investigations/5", headers=HEADERS).json()["status"] == "SUCCEEDED"


# 보내기 결과를 참 · 거짓으로 돌려준다 (Spring 응답 2xx만 성공)
def test_notifier_returnsWhetherSpringAccepted() -> None:
    result = InvestigationResult.model_validate(request_body() | {"status": "FAILED"})

    async def send(spring: FakeSpring) -> bool:
        notifier = SpringResultNotifier("http://spring", KEY, transport=httpx.MockTransport(spring))
        return await notifier.notify(result)

    assert asyncio.run(send(FakeSpring(status=204))) is True
    assert asyncio.run(send(FakeSpring(status=401))) is False
    assert asyncio.run(send(FakeSpring(fail=True))) is False


# Spring 주소를 설정하지 않으면 보내지 않는다 (조회로만 확인)
def test_noSpringUrl_doesNotNotify() -> None:
    c = TestClient(create_app(Settings(_env_file=None, service_key=KEY)))
    c.post("/investigations", json=request_body(), headers=HEADERS)

    assert c.app.state.investigation_service.notifier is None
