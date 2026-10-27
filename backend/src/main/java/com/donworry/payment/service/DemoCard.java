package com.donworry.payment.service;

import java.util.List;
import java.util.Optional;

// 시연용 모의 카드 (#82 · #98) — 카드 번호는 받지 않고 토큰만. 화면 Mock(api/mock/checkout.ts)과 같은 토큰 · 끝자리
// fingerprint는 같은 카드인지 알아보는 값 (새 카드 · 카드 테스팅 Rule), declineCode가 있으면 모의 카드사가 그 사유로 거절
public record DemoCard(
        String cardToken, String label, String last4, String country, String fingerprint, String declineCode) {

    public static final String LIMIT_EXCEEDED = "LIMIT_EXCEEDED";
    public static final String LOST_OR_STOLEN = "LOST_OR_STOLEN";
    public static final String INVALID_CARD = "INVALID_CARD";

    public static final List<DemoCard> ALL = List.of(
            new DemoCard("demo-card-usual", "자주 쓰는 카드", "4821", "KR", "demo-fp-usual", null),
            new DemoCard("demo-card-new", "처음 쓰는 카드", "1173", "KR", "demo-fp-new", null),
            new DemoCard("demo-card-foreign", "해외 발급 카드", "4402", "US", "demo-fp-foreign", null),
            new DemoCard("demo-card-decline", "한도 초과 카드", "0007", "KR", "demo-fp-decline", LIMIT_EXCEEDED),
            // 카드 테스팅 시연 (#98 F-7) — 사기범이 훔친 카드를 번갈아 넣어 본다
            new DemoCard("demo-card-stolen-1", "도난 카드 1", "3101", "KR", "demo-fp-stolen-1", null),
            new DemoCard("demo-card-stolen-2", "도난 카드 2", "3102", "KR", "demo-fp-stolen-2", LOST_OR_STOLEN),
            new DemoCard("demo-card-stolen-3", "도난 카드 3", "3103", "KR", "demo-fp-stolen-3", INVALID_CARD),
            new DemoCard("demo-card-stolen-4", "도난 카드 4", "3104", "KR", "demo-fp-stolen-4", null),
            new DemoCard("demo-card-stolen-5", "도난 카드 5", "3105", "KR", "demo-fp-stolen-5", LIMIT_EXCEEDED));

    public static Optional<DemoCard> of(String cardToken) {
        return ALL.stream().filter(card -> card.cardToken().equals(cardToken)).findFirst();
    }

    // 모의 카드사가 이 카드를 거절하는 사유. 승인하는 카드면 빈 값
    public static Optional<String> declineCodeOf(String fingerprint) {
        return ALL.stream()
                .filter(card -> card.declineCode() != null && card.fingerprint().equals(fingerprint))
                .map(DemoCard::declineCode)
                .findFirst();
    }
}
