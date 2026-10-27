package com.donworry.fds.api;

import java.util.List;
import java.util.Optional;

// 결제 하나의 최신 FDS 평가를 읽는 공개 경계 (#82) — investigation이 사건 · 경보 화면에 붙인다
public interface FdsPaymentEvaluations {

    Optional<PaymentEvaluation> latestForPayment(Long paymentId);

    // 경보 목록 · 상세 — investigation이 결제 · 사건 정보를 붙여 화면에 준다 (P2는 결제 · 사건을 모른다)
    FdsEvaluationPage list(FdsResult result, boolean attentionOnly, String search, int page, int size);

    Optional<FdsEvaluationDetail> find(Long evaluationId);

    // 이 평가에서 적중한 Rule 코드, 점수 큰 순
    List<String> matchedRuleCodes(Long evaluationId);

    // matchedRuleCodes: 적중(MATCH)한 Rule만, 점수 큰 순
    record PaymentEvaluation(Long evaluationId, Integer riskScore, FdsResult result, List<String> matchedRuleCodes) {

        public PaymentEvaluation {
            matchedRuleCodes = matchedRuleCodes == null ? List.of() : List.copyOf(matchedRuleCodes);
        }
    }
}
