package com.donworry.payment.service;

import java.util.List;
import java.util.Optional;

// 시연용 모의 카드 4장 (#82) — 카드 번호는 받지 않고 토큰만. 화면 Mock(api/mock/checkout.ts)과 같은 토큰 · 끝자리
// fingerprint는 같은 카드인지 알아보는 값 (처음 쓰는 카드 Rule), declines는 모의 카드사가 거절하는 카드
public record DemoCard(
        String cardToken, String label, String last4, String country, String fingerprint, boolean declines) {

    public static final List<DemoCard> ALL = List.of(
            new DemoCard("demo-card-usual", "자주 쓰는 카드", "4821", "KR", "demo-fp-usual", false),
            new DemoCard("demo-card-new", "처음 쓰는 카드", "1173", "KR", "demo-fp-new", false),
            new DemoCard("demo-card-foreign", "해외 발급 카드", "4402", "US", "demo-fp-foreign", false),
            new DemoCard("demo-card-decline", "한도 초과 카드", "0007", "KR", "demo-fp-decline", true));

    public static Optional<DemoCard> of(String cardToken) {
        return ALL.stream().filter(card -> card.cardToken().equals(cardToken)).findFirst();
    }

    public static boolean declines(String fingerprint) {
        return ALL.stream()
                .anyMatch(card -> card.declines() && card.fingerprint().equals(fingerprint));
    }
}
