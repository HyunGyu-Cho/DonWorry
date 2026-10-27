package com.donworry.fds.api;

import java.util.List;
import java.util.Optional;

// 결제 하나의 최신 FDS 평가를 읽는 공개 경계 (#82) — investigation이 사건 · 경보 화면에 붙인다
public interface FdsPaymentEvaluations {

    Optional<PaymentEvaluation> latestForPayment(Long paymentId);

    // matchedRuleCodes: 적중(MATCH)한 Rule만, 점수 큰 순
    record PaymentEvaluation(Long evaluationId, Integer riskScore, FdsResult result, List<String> matchedRuleCodes) {

        public PaymentEvaluation {
            matchedRuleCodes = matchedRuleCodes == null ? List.of() : List.copyOf(matchedRuleCodes);
        }
    }
}
