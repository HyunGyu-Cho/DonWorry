from pydantic import ValidationError

from app.agent.llm import LlmClient, LlmMessage
from app.schemas.investigation import InvestigationRequest, ReportDraft

# 형식 실패 이유를 사람이 읽는 이름으로 (화면 "조사 과정"에 그대로 쓰인다)
FIELD_NAMES = {
    "conclusion": "결론",
    "riskScore": "위험도",
    "recommendation": "권고",
    "riskEvidence": "위험 근거",
    "additionalChecks": "확인할 것",
}

SYSTEM_PROMPT = (
    "당신은 결제 보안 조사관입니다. 확인된 증거만 쓰고, 모르는 것은 unknowns에 적습니다. "
    "결제를 승인하거나 취소하지 않고 권고만 합니다. 답은 정해진 JSON 형식으로만 씁니다."
)


class InvalidAnswer(Exception):
    def __init__(self, reason: str, raw: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.raw = raw


# AI에게 묻고 답을 보고서 초안으로 바꾸는 일만 한다. 다시 묻기 · 작업 관리는 service 몫
class InvestigationAgent:
    def __init__(self, llm: LlmClient) -> None:
        self.llm = llm

    def first_messages(self, request: InvestigationRequest) -> list[LlmMessage]:
        question = (
            f"사건 {request.case_id} (증거 버전 {request.evidence_version})을 조사해 "
            "보고서 초안을 JSON으로 써 주세요."
        )
        return [
            LlmMessage(role="system", content=SYSTEM_PROMPT),
            LlmMessage(role="user", content=question),
        ]

    async def ask(self, messages: list[LlmMessage]) -> str:
        return await self.llm.complete(messages)

    def parse(self, raw: str) -> ReportDraft:
        try:
            return ReportDraft.model_validate_json(raw)
        except ValidationError as e:
            raise InvalidAnswer(_reason(e), raw) from e

    # 틀린 답과 이유를 대화에 붙여 다시 묻는다
    def correction(self, messages: list[LlmMessage], invalid: InvalidAnswer) -> list[LlmMessage]:
        return [
            *messages,
            LlmMessage(role="assistant", content=invalid.raw),
            LlmMessage(
                role="user",
                content=f"형식 검사 실패: {invalid.reason}. 같은 JSON 형식으로 다시 써 주세요.",
            ),
        ]


def _reason(error: ValidationError) -> str:
    first = error.errors()[0]
    field = str(first["loc"][0]) if first["loc"] else ""
    name = FIELD_NAMES.get(field, field or "JSON")
    if first["type"] == "missing":
        return f"필수 항목 '{name}' 누락"
    if first["type"] == "json_invalid":
        return "JSON 형식이 아님"
    return f"'{name}' 값이 맞지 않음 ({first['msg']})"
