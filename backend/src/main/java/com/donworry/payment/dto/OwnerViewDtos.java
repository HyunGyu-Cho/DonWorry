package com.donworry.payment.dto;

import java.time.Instant;

// 사장님 보안 확인 결과 · 메일 발송 기록 — 화면 types/payment.ts와 같은 모양 (점수 · Rule · AI 원문 · 구매자 개인정보 없음)
public final class OwnerViewDtos {

    private OwnerViewDtos() {}

    // result: CHECKING 검토 중 · ACCEPTED 결제 진행 · REJECTED 결제 반려 · AUTO_BLOCKED 자동 차단
    public record OwnerResult(
            String paymentId,
            String orderRef,
            String orderTitle,
            long amount,
            String result,
            String paymentStatus,
            Instant processedAt,
            String guide) {}

    public record NotificationView(
            String notificationId,
            String paymentId,
            String recipientType,
            String recipientEmail,
            String kind,
            String subject,
            String status,
            Instant createdAt,
            Instant sentAt,
            String failureReason) {}
}
