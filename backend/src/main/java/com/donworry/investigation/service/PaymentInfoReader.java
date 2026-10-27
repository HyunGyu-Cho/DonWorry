package com.donworry.investigation.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

// 화면 · 보고서에 보여 줄 P5 결제 정보와 P2 FDS 평가 근거 — P3는 금액 · 상태를 저장하지 않고 조회만 한다
// P5 PaymentLookup · P2 FdsPaymentEvaluations 공개 경계로 읽는다 (PaymentInfoAdapter, #82)
public interface PaymentInfoReader {

    Optional<PaymentInfo> find(Long paymentId);

    record PaymentInfo(
            Long paymentId,
            Long amount,
            String paymentStatus,
            Instant requestedAt,
            Integer riskScore,
            String fdsResult,
            List<String> ruleHits,
            // #82: 경보 · 사건 화면 표시용 (모르면 null)
            Long evaluationId,
            String orderTitle,
            String buyerName,
            String customerRef) {

        public PaymentInfo {
            ruleHits = ruleHits == null ? List.of() : List.copyOf(ruleHits);
        }

        public PaymentInfo(
                Long paymentId,
                Long amount,
                String paymentStatus,
                Instant requestedAt,
                Integer riskScore,
                String fdsResult,
                List<String> ruleHits) {
            this(paymentId, amount, paymentStatus, requestedAt, riskScore, fdsResult, ruleHits, null, null, null, null);
        }
    }
}
