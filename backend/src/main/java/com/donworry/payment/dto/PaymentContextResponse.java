package com.donworry.payment.dto;

import com.donworry.payment.api.PaymentLookup.PaymentView;
import java.time.Instant;

// 화면 types/payment.ts PaymentContext와 같은 모양. 접속 위치 · 기기 설명은 이름표로 (#100 F-11), 모르면 null
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
        IpInfo ip,
        String deviceId,
        String deviceLabel,
        String cardLast4,
        String cardCountry,
        Instant customerJoinedAt) {

    // 화면 types/auth.ts IpInfo — 나라(ISO) · 회선 종류(OFFICE · DOMESTIC · FOREIGN · ANONYMOUS) · 설명
    public record IpInfo(String address, String countryCode, String ipType, String label) {}

    public static PaymentContextResponse from(PaymentView payment, IpInfo ip, String deviceLabel) {
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
                ip,
                payment.deviceId(),
                deviceLabel,
                payment.cardLast4(),
                payment.cardCountry(),
                payment.customerJoinedAt());
    }
}
