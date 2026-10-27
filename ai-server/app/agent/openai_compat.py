import json
import re

import httpx

from app.agent.llm import LlmError, LlmMessage, LlmReply, ToolCall
from app.agent.tools import ToolSpec

# 진짜 AI 연결 — Ollama(/v1)와 OpenAI가 같은 모양(chat/completions)이라 하나로 둘 다 부른다 (#88)
# 키는 요청 머리말에만 쓰고 오류 · 로그에 남기지 않는다

# 답을 ```json ... ``` 으로 감싸 보내는 모델이 많다 — 형식 검사 전에 껍데기만 벗긴다
_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


class OpenAiCompatibleClient:
    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout_seconds: float = 180.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model = model
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.timeout = timeout_seconds
        self.transport = transport

    async def complete(
        self,
        messages: list[LlmMessage],
        tools: list[ToolSpec],
        answer_schema: dict[str, object] | None = None,
    ) -> LlmReply:
        body: dict[str, object] = {
            "model": self.model,
            "messages": to_wire(messages),
            "stream": False,
            "temperature": 0.2,
        }
        if tools:
            body["tools"] = [_tool(spec) for spec in tools]
        # 형식 고정 — Ollama는 이 모양 밖의 글자를 못 쓰게 막는다
        # strict는 끈다 (OpenAI strict는 기본값이 있는 칸을 못 받음)
        if answer_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "report", "schema": answer_schema, "strict": False},
            }
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
                res = await client.post(self.url, json=body, headers=self.headers)
        except httpx.TimeoutException as e:
            raise LlmError(f"AI 응답 시간 초과 ({self.timeout:.0f}초)") from e
        except httpx.HTTPError as e:
            raise LlmError(f"AI 서버 연결 실패 ({type(e).__name__})") from e
        if res.status_code >= 400:
            raise LlmError(f"AI 서버 오류 {res.status_code}: {res.text[:200]}")
        return from_wire(res)


def _tool(spec: ToolSpec) -> dict[str, object]:
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.parameters,
        },
    }


# 우리 대화 → chat/completions 메시지. role=tool은 바로 앞 AI 요청의 창구 순서대로 id를 짝짓는다
def to_wire(messages: list[LlmMessage]) -> list[dict[str, object]]:
    wire: list[dict[str, object]] = []
    pending: list[str] = []
    for index, message in enumerate(messages):
        if message.role == "assistant" and message.tool_calls:
            ids = [call.id or f"call_{index}_{n}" for n, call in enumerate(message.tool_calls)]
            pending = list(ids)
            wire.append(
                {
                    "role": "assistant",
                    "content": message.content or None,
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": json.dumps(call.arguments, ensure_ascii=False),
                            },
                        }
                        for call_id, call in zip(ids, message.tool_calls, strict=True)
                    ],
                }
            )
        elif message.role == "tool":
            call_id = pending.pop(0) if pending else f"call_{index}"
            wire.append({"role": "tool", "tool_call_id": call_id, "content": message.content})
        else:
            wire.append({"role": message.role, "content": message.content})
    return wire


# chat/completions 응답 → 우리 답. 모양이 깨지면 호출 실패(LlmError)로 본다
def from_wire(res: httpx.Response) -> LlmReply:
    try:
        message = res.json()["choices"][0]["message"]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise LlmError("AI 응답 모양이 다름 (choices 없음)") from e
    calls = [_call(raw) for raw in message.get("tool_calls") or []]
    content = message.get("content") or ""
    if not calls:
        content = strip_fence(content)
    return LlmReply(content=content, tool_calls=calls)


def _call(raw: dict[str, object]) -> ToolCall:
    function = raw.get("function")
    if not isinstance(function, dict) or not isinstance(function.get("name"), str):
        raise LlmError("AI 응답 모양이 다름 (창구 이름 없음)")
    arguments = function.get("arguments") or {}
    # OpenAI는 JSON 문자열, Ollama는 객체로 줄 때가 있다. 못 읽으면 인자 없이 부른다
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments) if arguments.strip() else {}
        except json.JSONDecodeError:
            arguments = {}
    if not isinstance(arguments, dict):
        arguments = {}
    call_id = raw.get("id")
    return ToolCall(
        id=call_id if isinstance(call_id, str) else "",
        name=function["name"],
        arguments=arguments,
    )


def strip_fence(content: str) -> str:
    found = _FENCE.match(content)
    return found.group(1) if found else content.strip()
