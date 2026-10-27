import asyncio
import json

import httpx
import pytest

from app.agent.investigator import InvestigationAgent
from app.agent.llm import (
    LlmError,
    LlmMessage,
    MockLlmClient,
    ToolCall,
    create_llm_client,
)
from app.agent.mock_answers import compose_answer
from app.agent.openai_compat import OpenAiCompatibleClient, strip_fence, to_wire
from app.agent.tools import TOOL_SPECS
from app.config import Settings
from app.schemas.investigation import InvestigationStatus
from app.schemas.report import answer_schema
from app.service.investigations import InvestigationService
from tests.test_agent_tools import PAYMENT, FakeTools, request


def reply(message: dict[str, object]) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": message}]})


# Ollama처럼 답하는 가짜 서버 — 처음엔 FDS 증거 창구를 부르고, 결과를 받으면
# ```json``` 으로 감싼 보고서
class FakeOllama:
    def __init__(self) -> None:
        self.bodies: list[dict[str, object]] = []
        self.headers: list[httpx.Headers] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        self.bodies.append(body)
        self.headers.append(req.headers)
        tool_messages = [m for m in body["messages"] if m["role"] == "tool"]
        if not tool_messages:
            call = {
                "id": "call_a",
                "type": "function",
                "function": {"name": "get_fds_evidence", "arguments": '{"paymentIds": ["9001"]}'},
            }
            return reply({"role": "assistant", "content": "", "tool_calls": [call]})
        results = {"get_fds_evidence": json.loads(tool_messages[0]["content"])}
        draft = compose_answer("PAYMENT_FRAUD", results, [PAYMENT])
        text = "```json\n" + json.dumps(draft, ensure_ascii=False) + "\n```"
        return reply({"role": "assistant", "content": text})


def client(handler: object, api_key: str = "") -> OpenAiCompatibleClient:
    return OpenAiCompatibleClient(
        "http://127.0.0.1:11434/v1/",
        "qwen2.5:7b",
        api_key=api_key,
        transport=httpx.MockTransport(handler),
    )


# 진짜 AI 자리에 넣어도 조사 흐름(창구 부르기 → 보고서 → 형식 검사)이 그대로 돈다
def test_realClient_runsInvestigation_withToolCallAndFencedJson() -> None:
    fake = FakeOllama()
    tools = FakeTools()
    service = InvestigationService(InvestigationAgent(client(fake)), tools=tools)
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.SUCCEEDED, result.error
    assert tools.calls == ["get_fds_evidence"]
    first, second = fake.bodies
    assert first["model"] == "qwen2.5:7b" and first["stream"] is False
    offered = [t["function"]["name"] for t in first["tools"]]
    assert offered == [*(s.name for s in TOOL_SPECS), "finish_evidence"]
    # 창구 결과는 AI가 붙인 호출 번호와 짝지어 돌려보낸다
    assistant, tool = second["messages"][-2:]
    assert assistant["tool_calls"][0]["id"] == "call_a"
    assert tool == {"role": "tool", "tool_call_id": "call_a", "content": tool["content"]}
    # Ollama는 키가 없으니 Authorization 머리말도 없다
    assert "authorization" not in fake.headers[0]


def test_apiKey_onlyInHeader() -> None:
    fake = FakeOllama()
    asyncio.run(client(fake, api_key="secret-k").complete([LlmMessage(role="user")], []))
    assert fake.headers[0]["authorization"] == "Bearer secret-k"
    assert "secret-k" not in json.dumps(fake.bodies[0])


# 연결 실패 · 시간 초과 · 서버 오류 · 깨진 응답은 "AI 호출 실패"(LlmError) — 형식 틀림과 구분한다
@pytest.mark.parametrize(
    ("handler", "expected"),
    [
        (lambda r: (_ for _ in ()).throw(httpx.ConnectError("down")), "연결 실패"),
        (lambda r: (_ for _ in ()).throw(httpx.ReadTimeout("slow")), "시간 초과"),
        (lambda r: httpx.Response(404, text="model not found"), "404"),
        (lambda r: httpx.Response(200, json={"nope": 1}), "모양이 다름"),
    ],
)
def test_failures_becomeLlmError(handler: object, expected: str) -> None:
    with pytest.raises(LlmError, match=expected):
        asyncio.run(client(handler).complete([LlmMessage(role="user", content="q")], []))


# AI 서버에 연결되지 않으면 조사는 "AI 호출 실패"로 끝나고 직원이 다시 조사 · 수동 판정
def test_unreachableModel_failsInvestigation() -> None:
    def down(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    service = InvestigationService(InvestigationAgent(client(down)), tools=FakeTools())
    result = asyncio.run(service._investigate(request()))
    assert result.status == InvestigationStatus.FAILED
    assert result.error.code == "LLM_ERROR"


# Ollama는 인자를 객체로, OpenAI는 JSON 문자열로 준다. 못 읽는 인자는 빈 인자로 부른다
def test_toolArguments_objectStringOrBroken() -> None:
    calls = [
        {"function": {"name": "get_fds_evidence", "arguments": {"paymentIds": ["1"]}}},
        {"id": "x", "function": {"name": "get_case_payments", "arguments": "{broken"}},
    ]
    handler = lambda r: reply({"role": "assistant", "content": None, "tool_calls": calls})  # noqa: E731
    got = asyncio.run(client(handler).complete([LlmMessage(role="user")], TOOL_SPECS))
    assert got.tool_calls == [
        ToolCall(name="get_fds_evidence", arguments={"paymentIds": ["1"]}),
        ToolCall(id="x", name="get_case_payments"),
    ]


def test_toWire_pairsToolResultsInOrder() -> None:
    messages = [
        LlmMessage(role="user", content="q"),
        LlmMessage(role="assistant", tool_calls=[ToolCall(name="a"), ToolCall(id="k", name="b")]),
        LlmMessage(role="tool", tool_name="a", content="1"),
        LlmMessage(role="tool", tool_name="b", content="2"),
    ]
    wire = to_wire(messages)
    assert [c["id"] for c in wire[1]["tool_calls"]] == ["call_1_0", "k"]
    assert [m["tool_call_id"] for m in wire[2:]] == ["call_1_0", "k"]


def test_stripFence() -> None:
    assert strip_fence('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert strip_fence('```\n{"a": 1}```') == '{"a": 1}'
    assert strip_fence(' {"a": 1} ') == '{"a": 1}'


# 설정 한 줄로 제공자를 바꾼다. Ollama 기본 주소는 내 PC 안(127.0.0.1)만
def test_createLlmClient_byProvider() -> None:
    assert isinstance(create_llm_client(Settings()), MockLlmClient)
    ollama = create_llm_client(Settings(llm_provider="ollama"))
    assert isinstance(ollama, OpenAiCompatibleClient)
    assert ollama.url == "http://127.0.0.1:11434/v1/chat/completions"
    assert ollama.model == "qwen2.5:7b"
    with pytest.raises(ValueError, match="API_KEY"):
        create_llm_client(Settings(llm_provider="openai"))
    openai = create_llm_client(Settings(llm_provider="openai", llm_api_key="k", llm_model="m"))
    assert openai.url == "https://api.openai.com/v1/chat/completions"
    with pytest.raises(ValueError, match="지원하지 않는"):
        create_llm_client(Settings(llm_provider="claude"))


# 1차 보고서가 형식에 틀리면 2차는 창구 없이 보고서 모양을 고정해 묻는다
# (#88 PC 실행에서 7b가 매번 다르게 틀림)
def test_secondTry_locksAnswerSchema_withoutTools() -> None:
    fake = FakeOllama()

    def handler(req: httpx.Request) -> httpx.Response:
        res = fake(req)
        message = res.json()["choices"][0]["message"]
        if len(fake.bodies) == 2:
            draft = json.loads(strip_fence(message["content"]))
            draft["recommendations"][0]["kind"] = "WARNING"
            message["content"] = json.dumps(draft, ensure_ascii=False)
        return reply(message)

    service = InvestigationService(InvestigationAgent(client(handler)), tools=FakeTools())
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.SUCCEEDED, result.error
    tool_pick, first_report, second_report = fake.bodies
    assert "response_format" not in first_report and "tools" in first_report
    assert "tools" not in second_report
    schema = second_report["response_format"]["json_schema"]["schema"]
    assert schema == answer_schema("PAYMENT_FRAUD")
    details = [s.detail for s in result.steps]
    assert "AI 판단 — 보고서 작성 (2차)" in details


# 고정할 모양은 형식 검사와 같은 모델에서 — 화면 칸 이름(camelCase) · 권고 버튼 값 · 결제 권고 유무
def test_answerSchema_matchesValidation() -> None:
    fraud = answer_schema("PAYMENT_FRAUD")
    assert {"reportType", "riskScore", "checks", "paymentAdvice"} <= set(fraud["properties"])
    assert fraud["additionalProperties"] is False
    button = fraud["$defs"]["RecommendationButton"]["properties"]["kind"]
    assert button["enum"] == ["POSITIVE", "NEGATIVE", "INFO"]
    assert "paymentAdvice" not in answer_schema("STAFF_TAKEOVER")["properties"]


# 지시문 예시는 그대로 내도 형식 검사를 통과하는 모양이고, 결제 번호는 사건의 진짜 번호
@pytest.mark.parametrize("case_type", ["PAYMENT_FRAUD", "STAFF_TAKEOVER", "STAFF_SPRAY"])
def test_promptExample_passesValidation(case_type: str) -> None:
    req = request(case_type)
    agent = InvestigationAgent(MockLlmClient())
    question = agent.first_messages(req, with_tools=True)[1].content
    example = question.split("예시: ", 1)[1]
    draft = agent.parse(example, req)
    assert draft.report_type == case_type
    if case_type == "PAYMENT_FRAUD":
        assert f'"paymentId": "{PAYMENT}"' in example


# AI가 증거 수집 끝(finish_evidence)을 부르면 1차 보고서부터 창구 없이 모양을 고정해 묻는다 (#94)
# 증거 수집 끝은 Spring에 보내지 않고, 창구 횟수(max_tool_calls)에도 세지 않는다
@pytest.mark.parametrize("together", [False, True])
def test_finishEvidence_locksFirstReport(together: bool) -> None:
    bodies: list[dict[str, object]] = []

    def call(call_id: str, name: str) -> dict[str, object]:
        return {"id": call_id, "type": "function", "function": {"name": name, "arguments": "{}"}}

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        bodies.append(body)
        tools_seen = [m for m in body["messages"] if m["role"] == "tool"]
        if "response_format" in body:
            evidence = json.loads(tools_seen[0]["content"])
            draft = compose_answer("PAYMENT_FRAUD", {"get_fds_evidence": evidence}, [PAYMENT])
            return reply({"role": "assistant", "content": json.dumps(draft, ensure_ascii=False)})
        if together:
            calls = [call("a", "get_fds_evidence"), call("b", "finish_evidence")]
        elif not tools_seen:
            calls = [call("a", "get_fds_evidence")]
        else:
            calls = [call("b", "finish_evidence")]
        return reply({"role": "assistant", "content": "", "tool_calls": calls})

    tools = FakeTools()
    agent = InvestigationAgent(client(handler))
    service = InvestigationService(agent, tools=tools, max_tool_calls=1)
    result = asyncio.run(service._investigate(request()))

    assert result.status == InvestigationStatus.SUCCEEDED, result.error
    assert tools.calls == ["get_fds_evidence"]
    report_ask = bodies[-1]
    assert "tools" not in report_ask and "response_format" in report_ask
    assert all("response_format" not in body for body in bodies[:-1])
    details = [s.detail for s in result.steps]
    assert details[-3:] == ["AI 판단 — 보고서 작성 (1차)", "구조 검증 통과", "근거 검사 통과"]
    if not together:
        assert "AI 판단 — 증거 수집 끝" in details
