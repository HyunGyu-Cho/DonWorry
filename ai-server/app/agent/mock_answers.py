# 가짜 AI의 시연 답 — 화면 Mock 시나리오(① 결제 사기 · ② 분산 공격 · ④ 계정 탈취)와 같은 이야기
# 진짜 증거를 읽지 않으므로 결제 ID 등은 예시다. Tool로 증거를 읽는 건 2-19

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
