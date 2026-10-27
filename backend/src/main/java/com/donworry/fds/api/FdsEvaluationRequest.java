package com.donworry.fds.api;

import java.time.Instant;
import java.util.UUID;
import lombok.Builder;

@Builder
// 결제 평가 요청 — 이력 값은 P5가 자기 결제 이력으로 계산해 넘긴다 (#82 · #96, P2는 payments를 읽지 않음)
// 모르는 값은 null — 그 값을 쓰는 Rule은 판단하지 않는다(UNAVAILABLE). 카드 원문 번호는 받지 않는다
public record FdsEvaluationRequest(
        UUID evaluationRequestId,
        Long paymentId,
        // 고객사(가맹점) — 이력 비교는 가맹점 + 구매자 단위 (#96)
        Long merchantId,
        String customerRef,
        long amount,
        Instant paymentRequestedAt,
        // 같은 카드인지 알아보는 값 (카드 번호 해시 · 토큰). R03 · R06 · R07 · R08
        String cardFingerprint,
        // 결제창이 수집한 기기 · 접속 IP. R02 · R05 · R06 · R07
        String deviceId,
        String clientIp,
        // 접속 IP의 나라(ISO) · 회선 종류(DOMESTIC · FOREIGN · ANONYMOUS …) — P5가 찾아 넘김, 모르면 null. R05 (#98)
        String clientCountry,
        String clientIpType,
        // 구매자 이메일 — R07 차단 목록
        String buyerEmail,
        // 같은 가맹점 · 같은 구매자의 매입 완료 결제가 있는지 — R02 · R03은 있을 때만 판단
        Boolean hasPriorCapturedPayment,
        // 이 구매자가 이 카드로 매입까지 끝낸 결제 수 — R03
        Integer cardCompletedPayments,
        // 이 구매자가 이 기기로 매입까지 끝낸 결제 수 — R02 (#98)
        Integer deviceCompletedPayments) {

    public FdsEvaluationRequest(
            UUID evaluationRequestId, Long paymentId, String customerRef, long amount, Instant paymentRequestedAt) {
        this(
                evaluationRequestId,
                paymentId,
                null,
                customerRef,
                amount,
                paymentRequestedAt,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
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
