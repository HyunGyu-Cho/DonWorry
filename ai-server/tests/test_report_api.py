"""C04 계약 테스트. Mock LLM 으로 외부 호출 없이 검증한다 (02-3)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _payload(evidence_version: int = 1, risk_score: int = 60) -> dict:
    return {
        "reportRequestId": "req-1",
        "caseId": 101,
        "evidenceVersion": evidence_version,
        "merchantId": 1,
        "subjectType": "PAYMENT_CUSTOMER",
        "signals": [
            {
                "sourceType": "FDS_ALERT",
                "sourceId": 11,
                "riskScore": risk_score,
                "occurredAt": "2026-10-23T01:00:00Z",
                "reason": "금액 50만원 이상, 10분 내 3회",
            }
        ],
        "payments": [
            {
                "paymentId": 1001,
                "amount": 700000,
                "status": "HELD",
                "occurredAt": "2026-10-23T01:00:00Z",
            }
        ],
    }


def test_health():
    assert client.get("/health").json() == {"status": "UP"}


def test_create_report_returns_contract_fields():
    response = client.post("/api/reports", json=_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["caseId"] == 101
    assert body["evidenceVersion"] == 1
    assert body["reportStatus"] == "COMPLETED"
    assert body["summary"]
    assert body["recommendation"] in {
        "REJECT_SUGGESTED",
        "RELEASE_SUGGESTED",
        "NEEDS_MORE_EVIDENCE",
    }


def test_same_case_and_evidence_version_is_idempotent():
    first = client.post("/api/reports", json=_payload(evidence_version=7)).json()
    second = client.post("/api/reports", json=_payload(evidence_version=7)).json()

    assert first == second


def test_high_risk_signal_suggests_reject():
    body = client.post("/api/reports", json=_payload(evidence_version=8, risk_score=95)).json()

    assert body["recommendation"] == "REJECT_SUGGESTED"


def test_unknown_field_is_rejected():
    payload = _payload(evidence_version=9)
    payload["unexpected"] = "x"

    assert client.post("/api/reports", json=payload).status_code == 422


def test_invalid_risk_score_is_rejected():
    payload = _payload(evidence_version=10)
    payload["signals"][0]["riskScore"] = 500

    assert client.post("/api/reports", json=payload).status_code == 422
