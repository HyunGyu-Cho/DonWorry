package com.donworry.payment.dto;

import java.time.Instant;

// 구매자 본인 확인 — 화면 types/payment.ts BuyerConfirmRequest · BuyerConfirmation과 같은 모양 (사유 · 점수 없음)
public final class BuyerConfirmDtos {

    private BuyerConfirmDtos() {}

    public record ConfirmRequestView(
            String merchantName, String orderTitle, long amount, Instant paidAt, Instant expiresAt, String answered) {}

    public record AnswerRequest(String answer) {}

    public record ConfirmationView(String confirmationId, String paymentId, String answer, Instant respondedAt) {}

    // 시연용 — 메일 대신 화면 버튼으로 여는 링크
    public record DemoLink(String url) {}
}
