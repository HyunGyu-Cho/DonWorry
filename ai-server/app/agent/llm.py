import asyncio
import json
import re
from typing import Literal, Protocol

from pydantic import BaseModel

from app.agent.mock_answers import TOOL_PLAN, compose_answer
from app.agent.tools import ToolSpec
from app.config import Settings


# AI가 부르고 싶은 증거 조회 창구 하나 (Ollama · OpenAI tool calling과 같은 모양)
class ToolCall(BaseModel):
    name: str
    arguments: dict[str, object] = {}


# role=tool은 창구 결과 (tool_name = 어느 창구), assistant의 tool_calls는 AI가 부른 창구
class LlmMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = []
    tool_name: str | None = None


Messages = list[LlmMessage]


# AI 답 — 창구를 더 부르거나(tool_calls), 보고서 JSON을 쓴다(content)
class LlmReply(BaseModel):
    content: str = ""
    tool_calls: list[ToolCall] = []


# LLM 호출 자체가 실패함 (연결 · 시간 초과 등) — 형식이 틀린 답과는 구분한다
class LlmError(Exception):
    pass


# LLM 제공자 경계 (AGENTS 6절). service는 어떤 제공자인지 모른다. Ollama · OpenAI는 2-20
# tools가 비어 있으면 창구 없이 바로 답한다 (Spring 주소가 없는 테스트 · 단독 실행)
class LlmClient(Protocol):
    async def complete(self, messages: Messages, tools: list[ToolSpec]) -> LlmReply: ...


# 가짜 AI — 판단 없이 사건 종류별로 정해진 순서대로 창구를 부른 뒤, 받은 증거로 보고서를 조립한다
# 같은 대화에서 보고서를 낸 횟수가 invalid_answers보다 적으면 형식이 틀린 답 (재시도 시연)
class MockLlmClient:
    def __init__(self, invalid_answers: int = 0, delay_seconds: float = 0.0) -> None:
        self.invalid_answers = invalid_answers
        self.delay_seconds = delay_seconds

    async def complete(
        self, messages: list[LlmMessage], tools: list[ToolSpec] | None = None
    ) -> LlmReply:
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
        case_type = _case_type(messages)
        offered = {tool.name for tool in tools or []}
        called = {m.tool_name for m in messages if m.role == "tool"}
        for name in TOOL_PLAN[case_type]:
            if name in offered and name not in called:
                return LlmReply(tool_calls=[ToolCall(name=name)])
        answered = sum(1 for m in messages if m.role == "assistant" and not m.tool_calls)
        draft = compose_answer(case_type, _tool_results(messages), _payment_ids(messages))
        if answered < self.invalid_answers:
            # 실제 LLM이 자주 하는 실수처럼 필수 항목 하나를 빠뜨린다
            del draft["checks"]
        return LlmReply(content=json.dumps(draft, ensure_ascii=False))


# 대화에 쌓인 창구 결과 (창구 이름 → Spring 응답). 읽을 수 없는 결과는 조회 실패로 본다
def _tool_results(messages: list[LlmMessage]) -> dict[str, dict[str, object]]:
    results: dict[str, dict[str, object]] = {}
    for message in messages:
        if message.role != "tool" or message.tool_name is None:
            continue
        try:
            parsed = json.loads(message.content)
        except json.JSONDecodeError:
            parsed = None
        if not isinstance(parsed, dict):
            parsed = {"ready": False, "note": "조회 실패", "data": []}
        results[message.tool_name] = parsed
    return results


# 질문 첫 줄 "사건 종류: X"에서 종류를 읽는다 (가짜 AI 전용)
def _case_type(messages: list[LlmMessage]) -> str:
    for message in messages:
        found = re.search(r"사건 종류: (\w+)", message.content)
        if found and found.group(1) in TOOL_PLAN:
            return found.group(1)
    return "PAYMENT_FRAUD"


# 질문의 "이 사건의 결제 번호: 57, 58 — ..." 줄에서 번호를 읽는다 (가짜 AI 전용)
def _payment_ids(messages: list[LlmMessage]) -> list[str]:
    for message in messages:
        found = re.search(r"이 사건의 결제 번호: ([\d, ]+)", message.content)
        if found:
            return [part.strip() for part in found.group(1).split(",") if part.strip()]
    return []


def create_llm_client(settings: Settings) -> LlmClient:
    if settings.llm_provider == "mock":
        return MockLlmClient(settings.mock_invalid_answers, settings.mock_delay_seconds)
    raise ValueError(f"지원하지 않는 LLM 제공자: {settings.llm_provider} (2-20에서 추가)")
