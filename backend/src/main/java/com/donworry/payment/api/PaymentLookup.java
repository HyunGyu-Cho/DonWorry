package com.donworry.payment.api;

import java.time.Instant;
import java.util.Optional;

// 다른 모듈(investigation)이 결제 정보를 읽는 공개 경계 (#82) — 읽기 전용
public interface PaymentLookup {

    Optional<PaymentView> find(Long paymentId);

    // 구매자 본인 확인 최신 응답 (#82) — AI 증거 창구 get_order_context가 읽는다. 아직 없으면 빈 값
    Optional<BuyerAnswer> latestBuyerAnswer(Long paymentId);

    record BuyerAnswer(String answer, java.time.Instant respondedAt) {}

    // 화면 · 보고서에 보일 결제 정보. 카드 번호 원문 · 지문은 넣지 않는다
    record PaymentView(
            Long paymentId,
            Long merchantId,
            String customerRef,
            String orderRef,
            String orderTitle,
            Long amount,
            String status,
            Instant requestedAt,
            String buyerName,
            String buyerEmail,
            Instant customerJoinedAt,
            String clientIp,
            String deviceId,
            String cardLast4,
            String cardCountry) {}
}
