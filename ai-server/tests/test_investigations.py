import asyncio
from uuid import uuid4

from fastapi.testclient import TestClient

from app.agent.investigator import InvestigationAgent
from app.agent.llm import LlmError, LlmMessage, MockLlmClient
from app.config import Settings
from app.main import create_app
from app.schemas.investigation import InvestigationRequest
from app.service.investigations import InvestigationService

KEY = "test-service-key"
HEADERS = {"X-Service-Key": KEY}


def settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, service_key=KEY, **overrides)


# 가짜 AI를 감싸 몇 번 물었는지 센다
class CountingLlm(MockLlmClient):
    def __init__(self, invalid_answers: int = 0) -> None:
        super().__init__(invalid_answers)
        self.calls = 0

    async def complete(self, messages: list[LlmMessage]) -> str:
        self.calls += 1
        return await super().complete(messages)


class BrokenLlm:
    async def complete(self, messages: list[LlmMessage]) -> str:
        raise LlmError("연결 시간 초과")


def body(report_id: int = 1, attempt_id: str | None = None) -> dict[str, object]:
    return {
        "reportId": report_id,
        "attemptId": attempt_id or str(uuid4()),
        "caseId": 201,
        "caseType": "PAYMENT_FRAUD",
        "evidenceVersion": 2,
    }


def client(llm: object | None = None, **overrides: object) -> TestClient:
    return TestClient(create_app(settings(**overrides), llm))  # type: ignore[arg-type]


# 올바른 키로 요청하면 바로 202, 응답은 camelCase
def test_accept_withValidKey_returns202() -> None:
    req = body()
    res = client().post("/investigations", json=req, headers=HEADERS)

    assert res.status_code == 202
    assert res.json() == {"reportId": 1, "attemptId": req["attemptId"], "status": "ACCEPTED"}


# 키가 없거나 틀리면 401, 서버에 키가 설정되지 않았으면 열어 두지 않고 503
def test_accept_withoutOrWrongKey_rejected() -> None:
    assert client().post("/investigations", json=body()).status_code == 401
    wrong = {"X-Service-Key": "nope"}
    assert client().post("/investigations", json=body(), headers=wrong).status_code == 401
    unset = TestClient(create_app(Settings(_env_file=None, service_key="")))
    assert unset.post("/investigations", json=body(), headers=HEADERS).status_code == 503
    assert unset.get("/investigations/1", headers=HEADERS).status_code == 503


# 필수 값이 빠지거나 잘못되면 422
def test_accept_invalidBody_returns422() -> None:
    missing = {"reportId": 1, "caseId": 201, "caseType": "PAYMENT_FRAUD", "evidenceVersion": 1}
    assert client().post("/investigations", json=missing, headers=HEADERS).status_code == 422
    bad = body() | {"evidenceVersion": 0}
    assert client().post("/investigations", json=bad, headers=HEADERS).status_code == 422
    # 사건 종류가 없거나 모르는 값이면 어떤 형식으로 쓸지 몰라 받지 않는다 (2-15)
    no_type = {k: v for k, v in body().items() if k != "caseType"}
    assert client().post("/investigations", json=no_type, headers=HEADERS).status_code == 422
    odd_type = body() | {"caseType": "UNKNOWN"}
    assert client().post("/investigations", json=odd_type, headers=HEADERS).status_code == 422


# 접수 뒤 조사가 끝나면 조회에 보고서와 과정(AI 판단 → 구조 검증 통과)이 남는다
def test_find_afterAccepted_returnsSucceededReport() -> None:
    c = client()
    req = body()
    c.post("/investigations", json=req, headers=HEADERS)

    res = c.get("/investigations/1", params={"attemptId": req["attemptId"]}, headers=HEADERS)

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SUCCEEDED"
    assert data["caseId"] == 201 and data["evidenceVersion"] == 2
    assert data["caseType"] == "PAYMENT_FRAUD"
    assert data["report"]["checks"] == ["구매자 본인 확인 응답"]
    assert data["error"] is None
    assert [s["detail"] for s in data["steps"]] == ["AI 판단 (1차)", "구조 검증 통과"]


# 같은 시도가 두 번 와도 AI에게는 한 번만 묻는다
def test_accept_sameAttemptTwice_runsOnce() -> None:
    llm = CountingLlm()
    c = client(llm)
    req = body()

    assert c.post("/investigations", json=req, headers=HEADERS).status_code == 202
    assert c.post("/investigations", json=req, headers=HEADERS).status_code == 202

    assert llm.calls == 1


# 같은 보고서에 새 시도가 오면 새로 조사하고, 옛 시도로는 조회되지 않는다
def test_accept_newAttempt_replacesOldAttempt() -> None:
    llm = CountingLlm()
    c = client(llm)
    old, new = body(attempt_id=str(uuid4())), body(attempt_id=str(uuid4()))

    c.post("/investigations", json=old, headers=HEADERS)
    c.post("/investigations", json=new, headers=HEADERS)

    assert llm.calls == 2
    params_old = {"attemptId": old["attemptId"]}
    assert c.get("/investigations/1", params=params_old, headers=HEADERS).status_code == 404
    latest = c.get("/investigations/1", headers=HEADERS).json()
    assert latest["attemptId"] == new["attemptId"]


# 없는 보고서를 물으면 404
def test_find_unknownReport_returns404() -> None:
    assert client().get("/investigations/999", headers=HEADERS).status_code == 404


# AI가 한 번 틀리면 이유를 붙여 다시 묻고, 두 번째에 맞으면 완료 — 과정에 "다시 시도"가 남는다
def test_investigate_invalidOnce_retriesAndSucceeds() -> None:
    c = client(mock_invalid_answers=1)
    c.post("/investigations", json=body(), headers=HEADERS)

    data = c.get("/investigations/1", headers=HEADERS).json()

    assert data["status"] == "SUCCEEDED"
    assert [s["detail"] for s in data["steps"]] == [
        "AI 판단 (1차)",
        "구조 검증 실패: 필수 항목 '확인할 것' 누락 → 다시 시도",
        "AI 판단 (2차)",
        "구조 검증 통과",
    ]


# 3번 모두 틀리면 이번 시도는 실패 — 이유와 횟수를 남긴다 (Spring이 시도 1회 실패로 센다)
def test_investigate_invalidThreeTimes_fails() -> None:
    c = client(mock_invalid_answers=3)
    c.post("/investigations", json=body(), headers=HEADERS)

    data = c.get("/investigations/1", headers=HEADERS).json()

    assert data["status"] == "FAILED"
    assert data["report"] is None
    assert data["error"]["code"] == "LLM_INVALID_ANSWER"
    assert data["error"]["llmAttempts"] == 3
    assert "확인할 것" in data["error"]["reason"]
    # 마지막 실패에는 "다시 시도"를 붙이지 않는다
    assert data["steps"][-1]["detail"] == "구조 검증 실패: 필수 항목 '확인할 것' 누락"


# AI 호출 자체가 실패하면 다시 묻지 않고 이번 시도를 실패로 끝낸다 (재시도는 Spring 몫)
def test_investigate_llmError_failsWithoutRetry() -> None:
    c = client(BrokenLlm())
    c.post("/investigations", json=body(), headers=HEADERS)

    data = c.get("/investigations/1", headers=HEADERS).json()

    assert data["status"] == "FAILED"
    assert data["error"]["code"] == "LLM_ERROR"
    assert data["error"]["llmAttempts"] == 1


# 조사 중에 새 시도가 들어오면, 먼저 시작한 시도의 결과는 버린다
def test_run_newAttemptDuringRun_discardsOldResult() -> None:
    async def scenario() -> None:
        release = asyncio.Event()

        class SlowLlm(MockLlmClient):
            async def complete(self, messages: list[LlmMessage]) -> str:
                await release.wait()
                return await super().complete(messages)

        service = InvestigationService(InvestigationAgent(SlowLlm()))
        old = InvestigationRequest.model_validate(body())
        new = InvestigationRequest.model_validate(body())

        service.accept(old)
        running = asyncio.create_task(service.run(old))
        await asyncio.sleep(0)
        service.accept(new)
        release.set()
        await running

        assert service.find(1, old.attempt_id) is None
        current = service.find(1)
        assert current is not None
        assert current.attempt_id == new.attempt_id
        assert current.status == "RUNNING"

    asyncio.run(scenario())


# ai-server에는 결제 · 판정을 바꾸는 API가 없다 (AGENTS 6절) — 조사 접수 · 조회 · 건강 확인뿐
def test_routes_onlyInvestigationAndHealth() -> None:
    paths = create_app(settings()).openapi()["paths"]
    routes = {(method.upper(), path) for path, ops in paths.items() for method in ops}
    assert routes == {
        ("POST", "/investigations"),
        ("GET", "/investigations/{report_id}"),
        ("GET", "/health"),
    }
