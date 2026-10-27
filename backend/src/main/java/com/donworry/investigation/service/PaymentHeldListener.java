package com.donworry.investigation.service;

import com.donworry.payment.api.PaymentHeld;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

// P5 매입 보류 → 사건 만들기 · 묶기 (#82). 승인 커밋 뒤에만 — 롤백된 보류로 사건을 만들지 않는다
// 트랜잭션을 열지 않는다: CaseIntakeService가 연결을 커밋한 뒤에 보고서 요청 리스너가 돈다
@Component
@RequiredArgsConstructor
class PaymentHeldListener {

    private final CaseIntakeService caseIntakeService;

    @TransactionalEventListener
    void on(PaymentHeld event) {
        caseIntakeService.receive(new HeldPayment(
                event.paymentId(),
                event.merchantId(),
                event.customerRef(),
                event.amount(),
                event.authorizationRef(),
                event.evaluationId(),
                event.heldAt()));
    }
}
