package com.donworry.payment.api;

import java.time.Instant;
import java.util.Objects;

// 결제가 매입 보류(HELD)됐다 — 카드 승인은 됐고 직원 확인을 기다린다 (#82)
// investigation이 받아 사건을 만들거나 묶는다. 승인 저장과 같은 트랜잭션에서 발행한다 (ADR-0012: 받는 쪽이 이 api를 import)
public record PaymentHeld(
        Long paymentId,
        Long merchantId,
        String customerRef,
        Long amount,
        String authorizationRef,
        Long evaluationId,
        Instant heldAt) {

    public PaymentHeld {
        Objects.requireNonNull(paymentId, "paymentId");
        Objects.requireNonNull(merchantId, "merchantId");
        Objects.requireNonNull(customerRef, "customerRef");
        Objects.requireNonNull(heldAt, "heldAt");
    }
}
