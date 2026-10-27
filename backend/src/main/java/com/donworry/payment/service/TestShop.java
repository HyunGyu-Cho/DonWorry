package com.donworry.payment.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

// 시연용 테스트 상점 (#82) — CakeShop 없이 결제 흐름을 볼 때. 상품은 고정
// 구매자 김민수는 지난 결제 5건(평균 4만 원 · 자주 쓰는 카드) 시드가 있는 단골, 처음 온 손님은 이력이 없다 (#100 S-4)
public final class TestShop {

    public static final String MERCHANT_CODE = "DEMOSHOP";
    public static final String RETURN_URL = "/demo/shop/result";

    public static final Buyer BUYER =
            new Buyer("cakeshop-member-1024", "김민수", "minsu@example.com", Instant.parse("2025-03-02T01:00:00Z"));

    public static final List<Product> PRODUCTS = List.of(
            new Product("cake-set", "단체 행사용 케이크 세트", 650_000L, "고액 주문"),
            new Product("strawberry", "딸기 생크림 케이크", 38_000L, "평범한 주문"));

    // 처음 온 손님 번호 — 영문 소문자 · 숫자 4~16자 (화면이 탭마다 만든다)
    static final java.util.regex.Pattern GUEST_KEY = java.util.regex.Pattern.compile("[a-z0-9]{4,16}");

    private TestShop() {}

    // 시연 ⑤: 사기범이 막 만든 계정처럼 과거 결제가 없다 — 새 기기 · 새 카드 Rule은 확인 불가로 남는다
    public static Optional<Buyer> guest(String guestKey) {
        if (guestKey == null || !GUEST_KEY.matcher(guestKey).matches()) {
            return Optional.empty();
        }
        return Optional.of(new Buyer(
                "cakeshop-guest-" + guestKey, "처음 온 손님", "guest-" + guestKey + "@example.com", Instant.now()));
    }

    public static Optional<Product> product(String productId) {
        return PRODUCTS.stream().filter(p -> p.productId().equals(productId)).findFirst();
    }

    public record Product(String productId, String title, long amount, String note) {}

    public record Buyer(String customerRef, String name, String email, Instant joinedAt) {}
}
