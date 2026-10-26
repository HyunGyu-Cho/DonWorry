from pydantic import ValidationError

from app.agent.llm import LlmClient, LlmMessage, LlmReply
from app.agent.tools import ToolSpec
from app.schemas.investigation import InvestigationRequest
from app.schemas.report import REPORT_DRAFT, PaymentFraudDraft, ReportDraft

# 형식 실패 이유를 사람이 읽는 이름으로 (화면 "조사 과정"에 그대로 쓰인다)
FIELD_NAMES = {
    "reportType": "사건 종류",
    "riskScore": "위험도",
    "verdict": "한 줄 결론",
    "summary": "요약",
    "recommendations": "권고 버튼",
    "riskPoints": "위험 근거",
    "normalPoints": "정상 정황",
    "unknowns": "모르는 것",
    "checks": "확인할 것",
    "paymentAdvice": "결제별 권고",
}

SYSTEM_PROMPT = (
    "당신은 결제 · 직원 계정 보안 조사관입니다. "
    "확인된 증거만 쓰고, 모르는 것은 unknowns에 적습니다. "
    "결제를 승인 · 취소하거나 계정을 바꾸지 않고 권고만 합니다. "
    "부정거래 확률을 만들어내지 않습니다. 답은 정해진 JSON 형식으로만 씁니다."
)

# 사건 종류별로 무엇을 써야 하는지 — 형식 검사(app/schemas/report.py)와 같은 내용
TYPE_GUIDES = {
    "PAYMENT_FRAUD": (
        "결제 사기 의심 사건입니다. paymentAdvice에 결제마다 "
        "ACCEPT_REVIEW · REJECT_REVIEW · NEEDS_CHECK 중 하나와 이유를 꼭 씁니다."
    ),
    "STAFF_TAKEOVER": (
        "직원 계정 탈취 의심 사건입니다. 결제 권고(paymentAdvice)는 쓰지 않고, "
        "계정 조치(세션 끊기 · 계정 잠금 등)를 recommendations로 권고합니다."
    ),
    "STAFF_SPRAY": (
        "직원 계정 분산 대입 공격 사건입니다. 여러 IP로 흩어진 실패를 계정 기준으로 묶어 해석하고, "
        "결제 권고(paymentAdvice)는 쓰지 않습니다."
    ),
}

ANSWER_FORMAT = (
    "JSON 칸: reportType, riskScore(0~100), verdict, summary, "
    "recommendations[{label, kind: POSITIVE|NEGATIVE|INFO}], "
    "riskPoints[{title, detail, source}], normalPoints[{title, detail, source}], "
    "unknowns[], checks[] (확인할 것, 1개 이상), "
    "paymentAdvice[{paymentId, recommendation, reason}] (결제 사기만)"
)


# 창구를 쓸 수 있을 때 붙이는 안내 — AI가 스스로 고르되 FDS 증거부터, 받지 못한 것은 지어내지 않기
TOOL_GUIDE = (
    "증거는 창구(tool)를 불러 직접 확인하세요. get_fds_evidence를 먼저 부르세요. "
    "창구가 ready=false(데이터 준비 전 · 조회 실패)를 주면 "
    "그 내용은 지어내지 말고 unknowns에 적으세요. "
    "필요한 증거를 다 봤으면 창구를 더 부르지 말고 보고서 JSON을 쓰세요.\n"
)

ENOUGH_TOOLS = "창구는 충분히 불렀습니다. 이제 지금까지 받은 증거로 보고서 JSON을 쓰세요."


class InvalidAnswer(Exception):
    def __init__(self, reason: str, raw: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.raw = raw


# AI에게 묻고 답을 보고서 초안으로 바꾸는 일만 한다. 다시 묻기 · 작업 관리는 service 몫
class InvestigationAgent:
    def __init__(self, llm: LlmClient) -> None:
        self.llm = llm

    def first_messages(
        self, request: InvestigationRequest, with_tools: bool = False
    ) -> list[LlmMessage]:
        question = (
            f"사건 종류: {request.case_type}\n"
            f"사건 {request.case_id} (증거 버전 {request.evidence_version})을 조사해 "
            "보고서 초안을 JSON으로 써 주세요.\n"
            f"{TYPE_GUIDES[request.case_type]}\n{_payment_line(request)}"
            f"{TOOL_GUIDE if with_tools else ''}{ANSWER_FORMAT}"
        )
        return [
            LlmMessage(role="system", content=SYSTEM_PROMPT),
            LlmMessage(role="user", content=question),
        ]

    async def ask(self, messages: list[LlmMessage], tools: list[ToolSpec]) -> LlmReply:
        return await self.llm.complete(messages, tools)

    # AI가 창구를 부르겠다는 답과 각 창구 결과를 대화에 붙인다 (다음 질문에 같이 보낸다)
    def with_tool_results(
        self, messages: list[LlmMessage], reply: LlmReply, results: list[tuple[str, str]]
    ) -> list[LlmMessage]:
        return [
            *messages,
            LlmMessage(role="assistant", tool_calls=reply.tool_calls),
            *(LlmMessage(role="tool", tool_name=name, content=text) for name, text in results),
        ]

    # 창구를 너무 많이 불렀을 때 한 번 알린다
    def stop_calling(self, messages: list[LlmMessage]) -> list[LlmMessage]:
        return [*messages, LlmMessage(role="user", content=ENOUGH_TOOLS)]

    # 형식 검사 + 요청한 사건 종류와 같은 형식인지까지 본다
    def parse(self, raw: str, request: InvestigationRequest) -> ReportDraft:
        try:
            draft = REPORT_DRAFT.validate_json(raw)
        except ValidationError as e:
            raise InvalidAnswer(_reason(e), raw) from e
        if draft.report_type != request.case_type:
            reason = f"사건 종류가 다름 (요청 {request.case_type}, 답 {draft.report_type})"
            raise InvalidAnswer(reason, raw)
        # 결제별 권고는 사건에 묶인 결제만 — 지어낸 번호면 다시 묻는다 (Spring도 한 번 더 본다)
        if isinstance(draft, PaymentFraudDraft):
            known = {str(payment_id) for payment_id in request.payment_ids}
            unknown = [a.payment_id for a in draft.payment_advice if a.payment_id not in known]
            if unknown:
                raise InvalidAnswer(f"사건에 없는 결제 번호 {', '.join(unknown)}", raw)
        return draft

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


# 결제 사기면 쓸 수 있는 결제 번호를 질문에 적는다. 가짜 AI도 이 줄을 읽는다 (llm.py)
PAYMENT_LINE = "이 사건의 결제 번호: "


def _payment_line(request: InvestigationRequest) -> str:
    if request.case_type != "PAYMENT_FRAUD":
        return ""
    numbers = ", ".join(str(payment_id) for payment_id in request.payment_ids)
    return f"{PAYMENT_LINE}{numbers} — paymentAdvice의 paymentId는 이 번호만 씁니다.\n"


# 판별 유니온의 오류 위치는 ("PAYMENT_FRAUD", "checks", ...)처럼 종류 이름이 앞에 붙는다
# 그래서 위치에서 칸 이름만 골라 사람이 읽는 이름으로 바꾼다
def _reason(error: ValidationError) -> str:
    first = error.errors()[0]
    kind = first["type"]
    if kind == "json_invalid":
        return "JSON 형식이 아님"
    if kind in ("union_tag_not_found", "union_tag_invalid"):
        return "필수 항목 '사건 종류' 누락 또는 값이 틀림"
    fields = [str(part) for part in first["loc"] if str(part) in FIELD_NAMES]
    field = fields[0] if fields else ".".join(str(part) for part in first["loc"])
    name = FIELD_NAMES.get(field, field or "JSON")
    if kind == "missing":
        return f"필수 항목 '{name}' 누락"
    if kind == "extra_forbidden":
        return f"'{name}'은(는) 이 사건 종류에 쓰지 않음"
    if kind == "too_short":
        return f"'{name}'이(가) 비어 있음"
    return f"'{name}' 값이 맞지 않음 ({first['msg']})"
