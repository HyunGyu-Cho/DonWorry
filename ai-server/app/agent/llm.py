import asyncio
import json
from typing import Literal, Protocol

from pydantic import BaseModel

from app.config import Settings


class LlmMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


# LLM 호출 자체가 실패함 (연결 · 시간 초과 등) — 형식이 틀린 답과는 구분한다
class LlmError(Exception):
    pass


# LLM 제공자 경계 (AGENTS 6절). service는 어떤 제공자인지 모른다. OpenAI · Ollama는 2-20
class LlmClient(Protocol):
    async def complete(self, messages: list[LlmMessage]) -> str: ...


# 가짜 AI — 같은 대화에서 정정 요청을 받은 횟수가 invalid_answers보다 적으면 형식이 틀린 답을 낸다
class MockLlmClient:
    def __init__(self, invalid_answers: int = 0, delay_seconds: float = 0.0) -> None:
        self.invalid_answers = invalid_answers
        self.delay_seconds = delay_seconds

    async def complete(self, messages: list[LlmMessage]) -> str:
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
        answered = sum(1 for m in messages if m.role == "assistant")
        draft = {
            "conclusion": "여러 위험 신호가 겹쳐 직원 확인이 필요합니다.",
            "riskScore": 78,
            "recommendation": "NEEDS_CHECK",
            "riskEvidence": ["FDS 적중 Rule이 여러 개입니다"],
            "normalEvidence": [],
            "unknowns": ["고객 본인의 결제 의사"],
            "additionalChecks": ["구매자 본인 확인"],
        }
        if answered < self.invalid_answers:
            # 실제 LLM이 자주 하는 실수처럼 필수 항목 하나를 빠뜨린다
            del draft["additionalChecks"]
        return json.dumps(draft, ensure_ascii=False)


def create_llm_client(settings: Settings) -> LlmClient:
    if settings.llm_provider == "mock":
        return MockLlmClient(settings.mock_invalid_answers, settings.mock_delay_seconds)
    raise ValueError(f"지원하지 않는 LLM 제공자: {settings.llm_provider} (2-20에서 추가)")
