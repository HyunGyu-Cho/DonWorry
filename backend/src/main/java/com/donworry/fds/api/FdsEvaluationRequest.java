package com.donworry.fds.api;

import java.time.Instant;
import java.util.UUID;
import lombok.Builder;

@Builder
// customerAverageAmount · cardCompletedPayments는 P5가 자기 결제 이력으로 계산해 넘긴다 (#82, P2는 payments를 읽지 않음)
// 이력이 없거나 결제창 밖 결제면 null — 그 Rule은 판단하지 않는다(UNAVAILABLE)
public record FdsEvaluationRequest(
        UUID evaluationRequestId,
        Long paymentId,
        String customerRef,
        long amount,
        Instant paymentRequestedAt,
        Long customerAverageAmount,
        Integer cardCompletedPayments) {

    public FdsEvaluationRequest(
            UUID evaluationRequestId, Long paymentId, String customerRef, long amount, Instant paymentRequestedAt) {
        this(evaluationRequestId, paymentId, customerRef, amount, paymentRequestedAt, null, null);
    }

    public FdsEvaluationRequest {
        if (evaluationRequestId == null) {
            throw new IllegalArgumentException("evaluationRequestId must not be null");
        }
        if (paymentId == null) {
            throw new IllegalArgumentException("paymentId must not be null");
        }
        if (paymentId <= 0) {
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
