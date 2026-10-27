package com.donworry.payment.api;

import java.time.Instant;
import java.util.Objects;

// 구매자가 본인 확인에 답했다 (#82) — investigation이 사건 기록에 남기고 AI가 다시 조사한다
// answer: MINE(제가 결제했어요) / NOT_MINE(결제하지 않았어요)
public record BuyerConfirmed(Long paymentId, String answer, Instant respondedAt) {

    public BuyerConfirmed {
        Objects.requireNonNull(paymentId, "paymentId");
        Objects.requireNonNull(answer, "answer");
        Objects.requireNonNull(respondedAt, "respondedAt");
    }
}
