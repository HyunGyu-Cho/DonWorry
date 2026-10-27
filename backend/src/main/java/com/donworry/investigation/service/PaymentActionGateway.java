package com.donworry.investigation.service;

import com.donworry.payment.api.PaymentActions;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

// 판정 → 결제 조치 (#82) — P5 공개 경계로 실제 결제 상태를 바꾼다 (지운 MockFinancialActionGateway 대신)
// 결제에 반영되면 접수(ACCEPTED), 반영할 수 없으면 거절(REJECTED). 예외는 부르는 쪽이 접수 여부 모름으로 둔다
@Component
@RequiredArgsConstructor
class PaymentActionGateway implements FinancialActionGateway {

    private final PaymentActions paymentActions;

    @Override
    public Receipt request(Command command) {
        PaymentActions.Result result =
                paymentActions.request(command.paymentId(), command.actionType().name(), command.idempotencyKey());
        return result.accepted() ? Receipt.accepted(result.operationId()) : Receipt.rejected(result.errorCode());
    }
}
