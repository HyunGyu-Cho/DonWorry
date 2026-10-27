package com.donworry.investigation.service;

import com.donworry.payment.api.BuyerConfirmed;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

// 구매자 본인 확인 응답 → 사건 새 증거 (#82). 응답 저장 커밋 뒤에만
@Component
@RequiredArgsConstructor
class BuyerConfirmedListener {

    private final BuyerAnswerService buyerAnswerService;

    @TransactionalEventListener
    void on(BuyerConfirmed event) {
        buyerAnswerService.record(event);
    }
}
