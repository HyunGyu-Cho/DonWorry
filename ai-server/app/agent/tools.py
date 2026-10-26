from typing import Protocol

from pydantic import BaseModel

from app.schemas.investigation import TraceStep


# AI가 고를 수 있는 증거 조회 창구 — Spring /internal/ai/tools/{name} (ADR-0009 Tool 표, #70)
# 모두 읽기 전용. 사건 범위 검증은 Spring이 한다
class ToolSpec(BaseModel):
    name: str
    description: str
    parameters: dict[str, object]


_NO_ARGS: dict[str, object] = {"type": "object", "properties": {}}
_PAYMENT_IDS: dict[str, object] = {
    "type": "object",
    "properties": {
        "paymentIds": {
            "type": "array",
            "items": {"type": "string"},
            "description": "볼 결제 번호. 없으면 사건 결제 전부",
        }
    },
}

TOOL_SPECS = [
    ToolSpec(
        name="get_fds_evidence",
        description="결제별 FDS 위험 점수와 적중 탐지 규칙. 조사를 시작할 때 먼저 부른다",
        parameters=_PAYMENT_IDS,
    ),
    ToolSpec(
        name="get_case_payments",
        description="사건에 묶인 결제 목록 (금액 · 상태 · 요청 시각)",
        parameters=_NO_ARGS,
    ),
    ToolSpec(
        name="get_payment_history",
        description="이 고객의 과거 결제 패턴",
        parameters=_NO_ARGS,
    ),
    ToolSpec(
        name="get_payment_authentication",
        description="카드 인증 · 승인 정보",
        parameters=_NO_ARGS,
    ),
    ToolSpec(
        name="get_security_events",
        description="로그인 · 기기 · 계정 이벤트 (직원 사건에도 쓴다)",
        parameters=_NO_ARGS,
    ),
    ToolSpec(
        name="get_order_context",
        description="주문 · 배송 · 구매자 연동 정보",
        parameters=_NO_ARGS,
    ),
    ToolSpec(
        name="find_similar_cases",
        description="비슷한 과거 사건과 판정 결과 (근거로만, 자동 판정에 쓰지 않는다)",
        parameters=_NO_ARGS,
    ),
]

TOOL_NAMES = {spec.name for spec in TOOL_SPECS}


# 창구 결과를 쓸 수 없게 된 시도 — Spring이 "현재 시도 아님"(409)으로 답함. 조사를 그만둔다
class AttemptOutdated(Exception):
    pass


# 증거 조회 경계 — 실제는 Spring 창구, 테스트는 가짜로 바꿔 끼운다
# 돌려주는 값은 AI에게 그대로 보여 줄 JSON 문자열. 조회 실패도 AI가 알 수 있게 문자열로 돌려준다
class ToolRunner(Protocol):
    async def call(
        self, report_id: int, attempt_id: str, name: str, args: dict[str, object]
    ) -> str: ...


# 조사 단계 알림 경계 — AI 판단 · 형식 검사 한 번이 끝날 때마다 Spring에 알린다 (2-19b)
# 실패해도 조사는 계속한다. Spring이 "현재 시도 아님"이면 AttemptOutdated로 멈춘다
class StepReporter(Protocol):
    async def report(self, report_id: int, attempt_id: str, step: TraceStep) -> None: ...
