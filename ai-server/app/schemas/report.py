from typing import Annotated, Literal

from pydantic import ConfigDict, Field, TypeAdapter

from app.schemas.base import CamelModel

# AI가 쓰는 보고서 칸 — 화면 frontend/src/types/report.ts의 [AI] 칸과 이름 · 뜻이 같다 (ADR-0009)
# [Spring] 칸(사건 번호 · 경위 · 결제 금액 · 증거 · 비슷한 사건 · 조사 과정)은 Spring이 합친다

CaseType = Literal["PAYMENT_FRAUD", "STAFF_TAKEOVER", "STAFF_SPRAY"]
Recommendation = Literal["ACCEPT_REVIEW", "REJECT_REVIEW", "NEEDS_CHECK"]

Text = Annotated[str, Field(min_length=1)]


# 권고 버튼 — POSITIVE 진행(초록) · NEGATIVE 중단 · 차단(빨강) · INFO 참고(파랑)
class RecommendationButton(CamelModel):
    model_config = ConfigDict(extra="forbid")
    label: Text
    kind: Literal["POSITIVE", "NEGATIVE", "INFO"]


# 위험 근거 · 정상 정황 한 줄. source = 어떤 증거에서 봤는지 (Tool 이름 등)
class ReportPoint(CamelModel):
    model_config = ConfigDict(extra="forbid")
    title: Text
    detail: Text
    source: Text


# 결제 하나에 대한 AI 권고. 결제 ID가 정말 그 사건 것인지는 Spring이 받을 때 검사한다 (2-17)
class PaymentAdvice(CamelModel):
    model_config = ConfigDict(extra="forbid")
    payment_id: Text
    recommendation: Recommendation
    reason: Text


# 세 종류 공통 칸. 모르는 칸은 받지 않는다 — 직원 사건에 결제 권고를 쓰면 형식 실패
class _DraftBase(CamelModel):
    model_config = ConfigDict(extra="forbid")
    risk_score: int = Field(ge=0, le=100)
    verdict: Text
    summary: Text
    recommendations: list[RecommendationButton] = Field(min_length=1)
    risk_points: list[ReportPoint] = Field(min_length=1)
    normal_points: list[ReportPoint] = []
    unknowns: list[Text] = []
    # 판정 전에 확인할 것 — 비면 직원이 무엇을 볼지 모르므로 형식 실패
    checks: list[Text] = Field(min_length=1)


# 결제 사기 의심 — 결제마다 매입 허용 검토 / 승인 취소 검토 / 추가 확인 권고
class PaymentFraudDraft(_DraftBase):
    report_type: Literal["PAYMENT_FRAUD"]
    payment_advice: list[PaymentAdvice] = Field(min_length=1)


# 직원 계정 탈취 의심 — 결제 권고 없이 계정 조치(세션 끊기 · 잠금 등)를 권고 버튼으로
class StaffTakeoverDraft(_DraftBase):
    report_type: Literal["STAFF_TAKEOVER"]


# 직원 계정 분산 대입 공격 — 여러 IP로 흩어진 실패를 계정 기준으로 묶어 본 해석
class StaffSprayDraft(_DraftBase):
    report_type: Literal["STAFF_SPRAY"]


# reportType 값으로 세 형식 중 하나를 고른다 (판별 유니온)
ReportDraft = Annotated[
    PaymentFraudDraft | StaffTakeoverDraft | StaffSprayDraft,
    Field(discriminator="report_type"),
]

REPORT_DRAFT = TypeAdapter(ReportDraft)

DRAFT_MODELS: dict[str, type[_DraftBase]] = {
    "PAYMENT_FRAUD": PaymentFraudDraft,
    "STAFF_TAKEOVER": StaffTakeoverDraft,
    "STAFF_SPRAY": StaffSprayDraft,
}


# 사건 종류 하나의 보고서 모양 (JSON Schema). 다시 물을 때 AI가 이 모양 밖으로 못 쓰게 건다 (#88)
# 형식 검사와 같은 모델에서 뽑아 검사 · 고정이 어긋나지 않는다
def answer_schema(case_type: str) -> dict[str, object]:
    return DRAFT_MODELS[case_type].model_json_schema(by_alias=True)
