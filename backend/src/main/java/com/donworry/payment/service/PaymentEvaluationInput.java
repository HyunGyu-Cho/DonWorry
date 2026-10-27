package com.donworry.payment.service;

import java.time.Instant;
import java.util.UUID;
import lombok.Builder;

@Builder
public record PaymentEvaluationInput(
        UUID evaluationRequestId,
        Long paymentId,
        String customerRef,
        long amount,
        Instant paymentRequestedAt,
        // FDS 입력 (#82 · #96) — 결제 정보와 이 고객의 이력. 모르면 null
        Long merchantId,
        String cardFingerprint,
        String deviceId,
        String clientIp,
        String buyerEmail,
        Boolean hasPriorCapturedPayment,
        Integer cardCompletedPayments,
        Integer deviceCompletedPayments) {

    public PaymentEvaluationInput {
        if (evaluationRequestId == null) {
            throw new IllegalArgumentException("evaluationRequestId must not be null");
        }
        if (paymentId == null || paymentId <= 0) {
            throw new IllegalArgumentException("paymentId must be positive");
        }
        if (customerRef == null || customerRef.isBlank()) {
            throw new IllegalArgumentException("customerRef must not be blank");
        }
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive");
        }
        if (paymentRequestedAt == null) {
            throw new IllegalArgumentException("paymentRequestedAt must not be null");
        }
    }
}
