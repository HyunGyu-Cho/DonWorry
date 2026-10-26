package com.donworry.investigation.report.service;

import java.util.Arrays;
import java.util.Optional;

// AI가 증거를 물어볼 수 있는 창구 7종 (ADR-0009 Tool 표, 2-19) — 모두 읽기 전용
// ready = 원천 데이터가 지금 있는지. 없으면 빈 결과와 "데이터 준비 전"으로 답한다 (10/26 결정)
// label은 화면 Mock(api/mock/reportSteps.ts)의 단계 이름과 같다
public enum ReportTool {
    GET_CASE_PAYMENTS("get_case_payments", "사건에 묶인 결제 조회", true),
    GET_FDS_EVIDENCE("get_fds_evidence", "FDS 점수 · 적중 Rule 조회", true),
    GET_PAYMENT_HISTORY("get_payment_history", "고객 과거 결제 조회", false),
    GET_PAYMENT_AUTHENTICATION("get_payment_authentication", "카드 인증 · 승인 정보 조회", false),
    GET_SECURITY_EVENTS("get_security_events", "로그인 · 기기 기록 조회", false),
    GET_ORDER_CONTEXT("get_order_context", "주문 · 구매자 정보 조회", false),
    FIND_SIMILAR_CASES("find_similar_cases", "비슷한 사건 찾기", false);

    private final String toolName;
    private final String label;
    private final boolean ready;

    ReportTool(String toolName, String label, boolean ready) {
        this.toolName = toolName;
        this.label = label;
        this.ready = ready;
    }

    public String toolName() {
        return toolName;
    }

    public String label() {
        return label;
    }

    public boolean ready() {
        return ready;
    }

    public static Optional<ReportTool> of(String toolName) {
        return Arrays.stream(values())
                .filter(tool -> tool.toolName.equals(toolName))
                .findFirst();
    }
}
