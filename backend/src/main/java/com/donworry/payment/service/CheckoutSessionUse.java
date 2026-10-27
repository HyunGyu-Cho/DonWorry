package com.donworry.payment.service;

import com.donworry.payment.entity.CheckoutSession;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.CheckoutSessionRepository;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 결제창을 쓰고 카드를 붙이는 트랜잭션 — FDS 평가 · 승인 전에 따로 커밋한다 (CheckoutService가 부른다)
@Service
@RequiredArgsConstructor
class CheckoutSessionUse {

    private final CheckoutSessionRepository sessionRepository;
    private final PaymentRepository paymentRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public CheckoutSession use(String tokenHash, DemoCard card, String clientIp, String deviceId) {
        CheckoutSession session = sessionRepository
                .findByTokenHashForUpdate(tokenHash)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.CHECKOUT_EXPIRED));
        Instant now = Instant.now();
        if (session.isUsed()) {
            throw new PaymentException(PaymentErrorCode.CHECKOUT_ALREADY_PAID);
        }
        if (session.isExpired(now)) {
            throw new PaymentException(PaymentErrorCode.CHECKOUT_EXPIRED);
        }
        session.use(now, clientIp, deviceId);
        Payment payment = paymentRepository
                .findByIdForUpdate(session.getPaymentId())
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
        payment.attachCheckout(clientIp, deviceId, card.fingerprint(), card.last4(), card.country());
        return session;
    }
}
