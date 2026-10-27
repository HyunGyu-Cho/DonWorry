package com.donworry.payment.service;

import com.donworry.payment.api.PaymentActions.Result;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.entity.PaymentStatus;
import com.donworry.payment.repository.PaymentRepository;
import com.donworry.settlement.api.CaptureRequested;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 결제 조치 한 번 = 한 트랜잭션. 이미 반영된 조치가 다시 오면 그대로 접수로 답한다 (멱등)
@Service
@RequiredArgsConstructor
class PaymentActionTransaction {

    private final PaymentRepository paymentRepository;
    private final ApplicationEventPublisher events;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Result apply(Long paymentId, String actionType) {
        Payment payment = paymentRepository.findByIdForUpdate(paymentId).orElse(null);
        if (payment == null) {
            return new Result(false, null, "PAYMENT_NOT_FOUND");
        }
        PaymentStatus status = payment.getStatus();
        if ("VOID".equals(actionType)) {
            if (status == PaymentStatus.HELD) {
                payment.voidHeld();
                return new Result(true, paymentId, null);
            }
            return status == PaymentStatus.VOIDED
                    ? new Result(true, paymentId, null)
                    : new Result(false, null, "PAYMENT_NOT_HELD");
        }
        if ("CAPTURE".equals(actionType)) {
            if (status == PaymentStatus.HELD) {
                payment.releaseHold();
                // 매입은 정산이 맡는다 — 커밋 뒤 정산이 매입하고 완료를 알리면 CAPTURED (기존 흐름)
                events.publishEvent(CaptureRequested.builder()
                        .paymentId(payment.getPaymentId())
                        .merchantId(payment.getMerchantId())
                        .orderId(payment.getOrderRef())
                        .amount(payment.getAmount())
                        .build());
                return new Result(true, paymentId, null);
            }
            return status == PaymentStatus.PENDING || status == PaymentStatus.CAPTURED
                    ? new Result(true, paymentId, null)
                    : new Result(false, null, "PAYMENT_NOT_HELD");
        }
        return new Result(false, null, "UNKNOWN_ACTION");
    }
}
