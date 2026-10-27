package com.donworry.payment.dto;

import com.donworry.payment.api.PaymentLookup.PaymentView;
import java.time.Instant;

// 화면 types/payment.ts PaymentContext와 같은 모양. 접속 위치 · 기기 설명(ip · deviceLabel)은 2-4 · 2-22에서
public record PaymentContextResponse(
        String paymentId,
        String orderRef,
        String orderTitle,
        long amount,
        String status,
        Instant requestedAt,
        String customerRef,
        String buyerEmail,
        String clientIp,
        Object ip,
        String deviceId,
        String deviceLabel,
        String cardLast4,
        String cardCountry,
        Instant customerJoinedAt) {

    public static PaymentContextResponse from(PaymentView payment) {
        return new PaymentContextResponse(
                String.valueOf(payment.paymentId()),
                payment.orderRef(),
                payment.orderTitle(),
                payment.amount(),
                payment.status(),
                payment.requestedAt(),
                payment.customerRef(),
                payment.buyerEmail(),
                payment.clientIp(),
                null,
                payment.deviceId(),
                null,
                payment.cardLast4(),
                payment.cardCountry(),
                payment.customerJoinedAt());
    }
}
