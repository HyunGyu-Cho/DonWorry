package com.donworry.payment.service;

import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PaymentCreationService {

    private final PaymentRepository paymentRepository;

    // 후속 평가·승인 흐름이 롤백돼도 최초 접수 기록은 남긴다.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long createPending(Long merchantId, String customerRef, String orderRef, Long amount) {
        return savePending(merchantId, customerRef, orderRef, amount).getPaymentId();
    }

    // Spring Bean 호출이 반환되면 커밋된 결제의 값으로 후속 평가를 구성한다.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PaymentCreationSnapshot createPendingSnapshot(
            Long merchantId, String customerRef, String orderRef, Long amount) {
        return PaymentCreationSnapshot.from(savePending(merchantId, customerRef, orderRef, amount));
    }

    private Payment savePending(Long merchantId, String customerRef, String orderRef, Long amount) {
        Payment payment = Payment.pending(merchantId, customerRef, orderRef, amount, Instant.now());
        return paymentRepository.save(payment);
    }

    // 저장된 결제를 다시 읽는다 — 결제창 결제는 준비 때 이미 저장했다 (#82)
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public PaymentCreationSnapshot snapshot(Long paymentId) {
        return paymentRepository
                .findById(paymentId)
                .map(PaymentCreationSnapshot::from)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
    }

    // FDS 입력값 (#82 · #96): 결제 정보(가맹점 · 카드 · 기기 · IP · 이메일)와 이 고객의 이력
    // 과거 정상 결제 = 같은 가맹점 · 같은 고객의 매입 완료(CAPTURED) — 승인만 된 보류 · 취소 결제는 치지 않는다
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Features features(Long paymentId) {
        Payment payment = paymentRepository
                .findById(paymentId)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
        boolean hasPriorCaptured =
                paymentRepository.countCaptured(payment.getMerchantId(), payment.getCustomerRef()) > 0;
        Integer cardCount = payment.getCardFingerprint() == null
                ? null
                : (int) paymentRepository.countCapturedWithCard(
                        payment.getMerchantId(), payment.getCustomerRef(), payment.getCardFingerprint());
        return new Features(
                payment.getMerchantId(),
                payment.getCardFingerprint(),
                payment.getDeviceId(),
                payment.getClientIp(),
                payment.getBuyerEmail(),
                hasPriorCaptured,
                cardCount);
    }

    public record Features(
            Long merchantId,
            String cardFingerprint,
            String deviceId,
            String clientIp,
            String buyerEmail,
            Boolean hasPriorCapturedPayment,
            Integer cardCompletedPayments) {}
}
