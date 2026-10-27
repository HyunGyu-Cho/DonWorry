package com.donworry.payment.dto;

import java.time.Instant;

// 결제창 · 테스트 상점 응답 — 화면 types/checkout.ts와 같은 모양 (구매자 화면이라 점수 · 사유 · 내부 상태 없음)
public final class CheckoutDtos {

    private CheckoutDtos() {}

    public record CheckoutSessionResponse(
            String merchantName,
            String orderTitle,
            long amount,
            String buyerName,
            String buyerEmailMasked,
            Instant expiresAt,
            String status) {}

    public record PayRequest(String cardToken) {}

    // outcome: PAID 결제 완료 · CHECKING 결제 확인 중 · BLOCKED 결제 불가 · DECLINED 카드사 거절
    public record CheckoutResultResponse(
            String paymentId, String outcome, String title, String message, String returnUrl) {}

    public record DemoCardResponse(String cardToken, String label, String masked, String country) {}

    public record TestProductResponse(String productId, String title, long amount, String note) {}

    public record TestOrderRequest(String productId) {}

    public record TestOrderResponse(String sessionToken) {}
}
