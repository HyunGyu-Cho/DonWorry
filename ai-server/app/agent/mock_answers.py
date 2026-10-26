# 가짜 AI의 답 — 창구로 증거를 받으면 그 증거로 조립하고(compose_answer, #72),
# 창구 없이 실행하면 화면 Mock 시나리오(① 결제 사기 · ② 분산 공격 · ④ 계정 탈취)와 같은 예시 답
# 예시 답의 결제 번호 "31"은 질문에 적힌 사건 결제 번호로 바꾼다
import copy

PAYMENT_FRAUD = {
    "reportType": "PAYMENT_FRAUD",
    "riskScore": 78,
    "verdict": "카드 도용 가능성이 있어 본인 확인이 필요합니다",
    "summary": "처음 쓰는 카드로 평소(4만 원)의 16배인 65만 원을 결제했습니다.",
    "recommendations": [
        {"label": "구매자 본인 확인 연락", "kind": "INFO"},
        {"label": "승인 취소 검토", "kind": "NEGATIVE"},
    ],
    "riskPoints": [
        {
            "title": "처음 쓰는 카드",
            "detail": "이 고객이 결제를 끝낸 적 없는 카드입니다",
            "source": "get_fds_evidence",
        },
        {
            "title": "평소보다 큰 금액",
            "detail": "평소 평균 4만 원의 16배입니다",
            "source": "get_payment_history",
        },
    ],
    "normalPoints": [
        {
            "title": "평소 쓰던 기기",
            "detail": "최근 결제와 같은 기기입니다",
            "source": "get_security_events",
        },
    ],
    "unknowns": ["구매자 본인의 결제 의사"],
    "checks": ["구매자 본인 확인 응답"],
    "paymentAdvice": [
        {
            "paymentId": "31",
            "recommendation": "NEEDS_CHECK",
            "reason": "본인 확인 전이라 판단을 미룹니다",
        },
    ],
}

STAFF_SPRAY = {
    "reportType": "STAFF_SPRAY",
    "riskScore": 88,
    "verdict": "여러 IP로 나눠 직원 계정들의 비밀번호를 대입하는 공격입니다 (아직 뚫리지 않음)",
    "summary": "IP 30곳에서 1~3번씩, 계정 기준으로 묶으면 10분에 41번 실패했습니다.",
    "recommendations": [
        {"label": "공격 IP 일괄 차단", "kind": "NEGATIVE"},
        {"label": "대상 직원 비밀번호 변경 안내", "kind": "INFO"},
    ],
    "riskPoints": [
        {
            "title": "계정 기준 실패 급증",
            "detail": "박지원 계정에 IP 25개에서 30번 실패했습니다",
            "source": "get_security_events",
        },
    ],
    "normalPoints": [
        {
            "title": "로그인 성공 없음",
            "detail": "공격 IP에서 성공한 로그인은 없습니다",
            "source": "get_security_events",
        },
    ],
    "unknowns": ["비밀번호가 다른 곳에서 유출됐는지"],
    "checks": ["대상 직원 최근 비밀번호 변경 여부"],
}

STAFF_TAKEOVER = {
    "reportType": "STAFF_TAKEOVER",
    "riskScore": 82,
    "verdict": "박지원 계정이 탈취되어 공격자가 탐지 설정을 끄려 한 것으로 보입니다",
    "summary": (
        "독일 Tor에서 로그인한 뒤 OTP 실패 · 세션 동시 사용 · Rule 끄기 요청이 이어졌습니다."
    ),
    "recommendations": [
        {"label": "의심 세션 강제 종료", "kind": "NEGATIVE"},
        {"label": "Rule 끄기 요청 거절", "kind": "NEGATIVE"},
        {"label": "비밀번호 · OTP 재등록", "kind": "INFO"},
    ],
    "riskPoints": [
        {
            "title": "낯선 위치의 동시 세션",
            "detail": "사내 PC 세션과 독일 Tor 세션이 함께 열려 있습니다",
            "source": "get_security_events",
        },
    ],
    "normalPoints": [],
    "unknowns": ["비밀번호가 어떻게 유출됐는지"],
    "checks": ["본인에게 Tor 접속 여부 확인"],
}

ANSWERS = {
    "PAYMENT_FRAUD": PAYMENT_FRAUD,
    "STAFF_SPRAY": STAFF_SPRAY,
    "STAFF_TAKEOVER": STAFF_TAKEOVER,
}

# 가짜 AI가 부르는 창구 순서 — 판단하지 않고 사건 종류별로 고정 (진짜 AI는 스스로 고른다, #72)
TOOL_PLAN = {
    "PAYMENT_FRAUD": [
        "get_fds_evidence",
        "get_case_payments",
        "get_payment_history",
        "find_similar_cases",
    ],
    "STAFF_SPRAY": ["get_security_events", "find_similar_cases"],
    "STAFF_TAKEOVER": ["get_security_events", "find_similar_cases"],
}

# 결제 Rule 이름 — DB 정본 fds_rules.display_name (seed_fds_rules)과 같다
RULE_NAMES = {
    "BLOCKLIST": "차단 목록 일치",
    "HIGH_AMOUNT": "고액 결제",
    "AMOUNT_SPIKE": "평소보다 큰 금액",
    "NEW_CARD": "처음 쓰는 카드",
    "NEW_ACCOUNT": "신규 계정 결제",
    "CARD_TESTING": "카드 테스팅",
    "DECLINE_RETRY": "거절 후 재시도",
    "GEO_MISMATCH": "해외 · 익명 접속",
}

# 데이터를 받지 못한 창구 → "모르는 것"에 적을 문장
UNKNOWN_BY_TOOL = {
    "get_payment_history": "이 고객의 과거 결제 패턴",
    "get_payment_authentication": "카드 인증 · 승인 정보",
    "get_security_events": "로그인 · 기기 기록",
    "get_order_context": "주문 · 배송 · 구매자 정보",
    "find_similar_cases": "비슷한 과거 사건",
}

# 이 점수 이상이면 승인 취소 검토를 권한다 (화면 위험도 "높음" 구간과 같다)
HIGH_RISK = 70

Results = dict[str, dict[str, object]]


# 창구 결과로 보고서를 조립한다. 창구를 하나도 부르지 않았으면 시연 예시 답 (결제 번호만 바꿔)
def compose_answer(case_type: str, results: Results, payment_ids: list[str]) -> dict[str, object]:
    draft = copy.deepcopy(ANSWERS[case_type])
    if not results:
        if "paymentAdvice" in draft and payment_ids:
            advice = draft["paymentAdvice"][0]
            draft["paymentAdvice"] = [{**advice, "paymentId": pid} for pid in payment_ids]
        return draft
    if case_type == "PAYMENT_FRAUD" and _ready(results, "get_fds_evidence"):
        draft = _payment_fraud(results)
    draft["unknowns"] = _unknowns(results)
    return draft


def _ready(results: Results, name: str) -> bool:
    return name in results and results[name].get("ready") is True


def _rows(results: Results, name: str) -> list[dict[str, object]]:
    data = results.get(name, {}).get("data") if _ready(results, name) else None
    return [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []


# 받지 못한 창구는 지어내지 않고 "모르는 것"으로
def _unknowns(results: Results) -> list[str]:
    unknowns = []
    for name, result in results.items():
        if result.get("ready") is not True and name in UNKNOWN_BY_TOOL:
            note = result.get("note") or "데이터 준비 전"
            unknowns.append(f"{UNKNOWN_BY_TOOL[name]} ({note})")
    return unknowns


def _payment_fraud(results: Results) -> dict[str, object]:
    evidence = _rows(results, "get_fds_evidence")
    payments = _rows(results, "get_case_payments")
    amounts = {str(r.get("paymentId")): r.get("amount") for r in payments}
    score = max((int(r.get("riskScore") or 0) for r in evidence), default=0)
    score = min(max(score, 0), 100)
    rules: list[str] = []
    for row in evidence:
        hits = row.get("ruleHits")
        for code in hits if isinstance(hits, list) else []:
            if code not in rules:
                rules.append(str(code))
    total = sum(int(a) for a in amounts.values() if isinstance(a, int))
    names = [RULE_NAMES.get(code, code) for code in rules]
    high = score >= HIGH_RISK

    risk_points = [
        {
            "title": RULE_NAMES.get(code, code),
            "detail": _rule_detail(code, evidence, amounts),
            "source": "get_fds_evidence",
        }
        for code in rules
    ] or [
        {
            "title": f"FDS 점수 {score}점",
            "detail": "적중한 탐지 규칙은 없지만 점수가 보류 구간입니다",
            "source": "get_fds_evidence",
        }
    ]
    recommendations = [{"label": "구매자 본인 확인 연락", "kind": "INFO"}]
    if high:
        recommendations.append({"label": "승인 취소 검토", "kind": "NEGATIVE"})
    advice = [
        {
            "paymentId": str(row.get("paymentId")),
            "recommendation": "REJECT_REVIEW" if high else "NEEDS_CHECK",
            "reason": (
                "위험 점수가 높아 승인 취소를 검토할 만합니다"
                if high
                else "본인 확인 전이라 판단을 미룹니다"
            ),
        }
        for row in evidence
    ]
    rule_text = " · ".join(names) if names else "탐지 규칙"
    return {
        "reportType": "PAYMENT_FRAUD",
        "riskScore": score,
        "verdict": (
            "위험 신호가 겹쳐 승인 취소를 검토할 만합니다"
            if high
            else "추가 확인 후 결제별로 판정할 것을 권고합니다"
        ),
        "summary": f"{rule_text}에 걸린 결제 {len(evidence)}건, 합계 {total:,}원입니다.",
        "recommendations": recommendations,
        "riskPoints": risk_points,
        "normalPoints": [],
        "unknowns": [],
        "checks": ["구매자 본인 확인 응답"],
        "paymentAdvice": advice,
    }


# "결제 1 (300,000원) · 65점"처럼 그 규칙이 걸린 결제를 적는다
# 번호는 화면 결제별 권고의 "결제 N"과 같은 순서 (원본 결제 번호는 문장에 넣지 않는다)
def _rule_detail(code: str, evidence: list[dict[str, object]], amounts: dict) -> str:
    parts = []
    for index, row in enumerate(evidence, start=1):
        hits = row.get("ruleHits")
        if isinstance(hits, list) and code in hits:
            amount = amounts.get(str(row.get("paymentId")))
            money = f" ({amount:,}원)" if isinstance(amount, int) else ""
            parts.append(f"결제 {index}{money} · {row.get('riskScore')}점")
    return ", ".join(parts) or "적중 결제 정보 없음"
