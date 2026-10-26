import copy
import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agent.investigator import InvalidAnswer, InvestigationAgent
from app.agent.llm import MockLlmClient
from app.agent.mock_answers import ANSWERS
from app.config import Settings
from app.main import create_app
from app.schemas.investigation import InvestigationRequest
from app.schemas.report import ReportDraft

KEY = "test-service-key"
HEADERS = {"X-Service-Key": KEY}
AGENT = InvestigationAgent(MockLlmClient())


def request(case_type: str) -> InvestigationRequest:
    return InvestigationRequest.model_validate(
        {
            "reportId": 1,
            "attemptId": "00000000-0000-0000-0000-000000000001",
            "caseId": 201,
            "caseType": case_type,
            "evidenceVersion": 1,
        }
    )


# 사건 종류의 가짜 답을 조금 바꿔 형식 검사에 넣는다
Change = Callable[[dict[str, Any]], object]


def parse(case_type: str, change: Change = lambda draft: None) -> ReportDraft:
    draft = copy.deepcopy(ANSWERS[case_type])
    change(draft)
    return AGENT.parse(json.dumps(draft, ensure_ascii=False), request(case_type))


def reason_of(case_type: str, change: Change) -> str:
    with pytest.raises(InvalidAnswer) as caught:
        parse(case_type, change)
    return caught.value.reason


# 세 종류 모두 가짜 AI 답이 형식 검사를 통과하고, 종류에 맞는 형식으로 읽힌다
@pytest.mark.parametrize("case_type", ["PAYMENT_FRAUD", "STAFF_TAKEOVER", "STAFF_SPRAY"])
def test_parse_eachCaseType_passes(case_type: str) -> None:
    draft = parse(case_type)
    assert draft.report_type == case_type
    assert draft.checks


# 결제 사기인데 결제별 권고가 없거나 비면 형식 실패
def test_parse_paymentFraudWithoutAdvice_fails() -> None:
    assert reason_of("PAYMENT_FRAUD", lambda d: d.pop("paymentAdvice")) == (
        "필수 항목 '결제별 권고' 누락"
    )
    empty = reason_of("PAYMENT_FRAUD", lambda d: d.update(paymentAdvice=[]))
    assert empty == "'결제별 권고'이(가) 비어 있음"


# 직원 사건에 결제별 권고를 쓰면 형식 실패
@pytest.mark.parametrize("case_type", ["STAFF_TAKEOVER", "STAFF_SPRAY"])
def test_parse_staffCaseWithPaymentAdvice_fails(case_type: str) -> None:
    advice = ANSWERS["PAYMENT_FRAUD"]["paymentAdvice"]
    reason = reason_of(case_type, lambda d: d.update(paymentAdvice=advice))
    assert reason == "'결제별 권고'은(는) 이 사건 종류에 쓰지 않음"


# 요청한 종류와 다른 형식으로 쓰면 형식 실패
def test_parse_otherCaseType_fails() -> None:
    raw = json.dumps(ANSWERS["STAFF_SPRAY"], ensure_ascii=False)
    with pytest.raises(InvalidAnswer) as caught:
        AGENT.parse(raw, request("STAFF_TAKEOVER"))
    assert caught.value.reason.startswith("사건 종류가 다름")


# 값이 틀리거나 칸이 빠지면 사람이 읽는 이유로 알려 준다 (화면 "조사 과정"에 그대로 쓰임)
def test_parse_invalidValues_readableReasons() -> None:
    assert reason_of("STAFF_SPRAY", lambda d: d.pop("checks")) == "필수 항목 '확인할 것' 누락"
    assert reason_of("STAFF_SPRAY", lambda d: d.update(riskScore=120)).startswith(
        "'위험도' 값이 맞지 않음"
    )
    wrong_kind = [{"label": "차단", "kind": "DANGER"}]
    assert reason_of("STAFF_SPRAY", lambda d: d.update(recommendations=wrong_kind)).startswith(
        "'권고 버튼' 값이 맞지 않음"
    )
    assert reason_of("STAFF_SPRAY", lambda d: d.pop("reportType")) == (
        "필수 항목 '사건 종류' 누락 또는 값이 틀림"
    )
    with pytest.raises(InvalidAnswer) as caught:
        AGENT.parse("보고서입니다", request("STAFF_SPRAY"))
    assert caught.value.reason == "JSON 형식이 아님"


# 직원 사건도 접수 → 완료까지 가고, 결과 JSON 칸 이름이 화면 타입과 같다
def test_staffSpray_endToEnd_returnsScreenFieldNames() -> None:
    c = TestClient(create_app(Settings(_env_file=None, service_key=KEY)))
    body = request("STAFF_SPRAY").model_dump(by_alias=True, mode="json")
    c.post("/investigations", json=body, headers=HEADERS)

    data = c.get("/investigations/1", headers=HEADERS).json()

    assert data["status"] == "SUCCEEDED"
    assert data["caseType"] == "STAFF_SPRAY"
    assert set(data["report"]) == {
        "reportType",
        "riskScore",
        "verdict",
        "summary",
        "recommendations",
        "riskPoints",
        "normalPoints",
        "unknowns",
        "checks",
    }
