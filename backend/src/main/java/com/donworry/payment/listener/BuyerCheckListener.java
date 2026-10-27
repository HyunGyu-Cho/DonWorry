package com.donworry.payment.listener;

import com.donworry.payment.api.PaymentHeld;
import com.donworry.payment.service.BuyerConfirmationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

// 매입 보류되면 구매자 본인 확인 요청을 남긴다 (#82) — 보류 커밋 뒤에만
@Component
@RequiredArgsConstructor
public class BuyerCheckListener {

    private final BuyerConfirmationService buyerConfirmationService;

    @TransactionalEventListener
    public void on(PaymentHeld event) {
        buyerConfirmationService.requestFor(event.paymentId());
    }
}
