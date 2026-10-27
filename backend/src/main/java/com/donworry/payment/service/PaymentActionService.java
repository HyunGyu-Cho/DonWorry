package com.donworry.payment.service;

import com.donworry.payment.api.PaymentActions;
import java.time.Duration;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

// 결제 조치 (#82) — 모의 카드사가 처리하는 시간(시연 5초)을 기다린 뒤 결제 상태를 바꾼다
// 기다리는 동안 사건은 "조치 진행 중"이다. 테스트는 0초
@Slf4j
@Service
public class PaymentActionService implements PaymentActions {

    private final PaymentActionTransaction transaction;
    private final Duration cardCompanyDelay;

    public PaymentActionService(
            PaymentActionTransaction transaction,
            @Value("${donworry.demo.card-company-delay:PT0S}") Duration cardCompanyDelay) {
        this.transaction = transaction;
        this.cardCompanyDelay = cardCompanyDelay;
    }

    @Override
    public Result request(Long paymentId, String actionType, UUID idempotencyKey) {
        if (!cardCompanyDelay.isZero()) {
            try {
                Thread.sleep(cardCompanyDelay);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new Result(false, null, "INTERRUPTED");
            }
        }
        Result result = transaction.apply(paymentId, actionType);
        log.info("결제 조치 paymentId={} action={} accepted={}", paymentId, actionType, result.accepted());
        return result;
    }
}
