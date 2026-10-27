package com.donworry.payment.service;

import com.donworry.identity.api.MerchantDirectory;
import com.donworry.payment.entity.Payment;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// 테스트 상점 주문 (#82) — 상점 서버가 할 결제 준비를 대신 부르고 결제창 토큰을 돌려준다
@Service
@RequiredArgsConstructor
public class TestShopService {

    private final CheckoutService checkoutService;
    private final MerchantDirectory merchantDirectory;

    public String order(String productId) {
        return order(productId, "MINSU", null);
    }

    // buyer: MINSU(단골 김민수) · GUEST(처음 온 손님, guestKey 필요) (#100 S-4)
    public String order(String productId, String buyerType, String guestKey) {
        TestShop.Buyer buyer = buyerType == null || "MINSU".equals(buyerType)
                ? TestShop.BUYER
                : "GUEST".equals(buyerType)
                        ? TestShop.guest(guestKey)
                                .orElseThrow(() -> new PaymentException(PaymentErrorCode.INVALID_TEST_BUYER))
                        : null;
        if (buyer == null) {
            throw new PaymentException(PaymentErrorCode.INVALID_TEST_BUYER);
        }
        TestShop.Product product =
                TestShop.product(productId).orElseThrow(() -> new PaymentException(PaymentErrorCode.UNKNOWN_PRODUCT));
        Long merchantId = merchantDirectory
                .findByCode(TestShop.MERCHANT_CODE)
                .map(MerchantDirectory.MerchantView::merchantId)
                .orElseThrow(() -> new IllegalStateException("시연 가맹점 DEMOSHOP 시드가 없습니다"));
        String orderRef = "TS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Payment.Order order = new Payment.Order(
                merchantId,
                buyer.customerRef(),
                orderRef,
                product.title(),
                product.amount(),
                buyer.name(),
                buyer.email(),
                buyer.joinedAt(),
                Instant.now().plus(2, ChronoUnit.DAYS));
        return checkoutService.open(order, TestShop.RETURN_URL);
    }
}
