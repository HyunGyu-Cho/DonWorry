package com.donworry.payment.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// 다른 모듈(investigation)이 결제 정보를 읽는 공개 경계 (#82) — 읽기 전용
public interface PaymentLookup {

    Optional<PaymentView> find(Long paymentId);

    // 구매자 본인 확인 최신 응답 (#82) — AI 증거 창구 get_order_context가 읽는다. 아직 없으면 빈 값
    Optional<BuyerAnswer> latestBuyerAnswer(Long paymentId);

    record BuyerAnswer(String answer, java.time.Instant respondedAt) {}

    // 같은 가게 · 같은 고객이 이 결제보다 먼저 한 결제 (#90) — AI 증거 창구 get_payment_history가 읽는다
    // 요약은 이전 결제 전부로, 목록(recent)은 최근 limit건만 — AI가 읽는 길이를 짧게
    // 평균 · 건수 · 최고 · 카드별 건수는 매입까지 끝난 결제(CAPTURED)만 — FDS 카드 이력(R03 NEW_CARD)과 같은 기준
    Optional<CustomerHistory> customerHistory(Long paymentId, int limit);

    record CustomerHistory(
            List<PastPayment> recent,
            long totalCount,
            Instant firstPaymentAt,
            long capturedCount,
            Long capturedAverageAmount,
            Long capturedMaxAmount,
            Map<String, Long> capturedCountByCard) {}

    record PastPayment(Long amount, String orderTitle, String cardLast4, String status, Instant requestedAt) {}

    // 이 결제의 카드 (#90) — get_payment_authentication이 읽는다. 카드 지문만 비교에 쓰고 내보내지 않는다
    // completedPaymentsWithCard = 이 결제 전에 이 고객이 이 카드로 매입까지 끝낸 결제 수 (0이면 처음 쓰는 카드, 카드를 모르면 null)
    Optional<CardUsage> cardUsage(Long paymentId);

    record CardUsage(
            String cardLast4, String cardCountry, Integer completedPaymentsWithCard, String authorizationRef) {}

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
