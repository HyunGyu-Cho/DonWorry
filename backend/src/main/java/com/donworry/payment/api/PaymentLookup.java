package com.donworry.payment.api;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

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

    // 차단 목록에 올릴 값 (#100) — 카드 지문은 모듈 안 Java 호출로만 넘기고 화면 · 보고서에는 내보내지 않는다
    Optional<BlockValues> blockValues(Long paymentId);

    record BlockValues(String cardFingerprint, String cardLast4, String deviceId, String clientIp, String buyerEmail) {}

    // 비슷한 과거 사건 찾기 (#104 2-9a) — 후보 결제 중 이 결제와 같은 값을 쓴 결제와 무엇이 같은지
    // 고객은 같은 가맹점 안에서만, 카드 · 기기 · IP · 이메일은 가맹점과 상관없이 비교한다. 값(카드 지문 등)은 내보내지 않는다
    // 겹치는 값이 없는 후보 · 이 결제 자신은 결과에 넣지 않는다
    Map<Long, Set<SharedValue>> sharedValues(Long paymentId, Collection<Long> candidatePaymentIds);

    enum SharedValue {
        CARD,
        DEVICE,
        IP,
        EMAIL,
        CUSTOMER
    }

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
