package com.donworry.payment.service;

import com.donworry.payment.entity.PaymentStatus;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PaymentEvaluationFlowService {

    private final PaymentCreationService creationService;
    private final PaymentEvaluationService evaluationService;
    private final PaymentAuthorizationService authorizationService;

    // 호출자 트랜잭션을 중단해 최초 저장과 P2 평가가 각각 커밋되도록 한다.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public PaymentEvaluationFlowResult createAndEvaluate(PaymentEvaluationFlowInput input) {
        var context = createEvaluationContext(input);
        return new PaymentEvaluationFlowResult(context.payment().paymentId(), context.evaluationResult());
    }

    // 최초 저장·평가 뒤 별도 Bean에서 승인 결과를 커밋한다. 재호출하면 새 결제가 생성된다.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public PaymentAuthorizationResult createAndAuthorize(PaymentEvaluationFlowInput input) {
        return authorizationService.authorize(createEvaluationContext(input));
    }

    // 결제창에서 카드를 고른 준비된 결제 (#82) — 저장은 이미 됐고 FDS 평가 · 승인만 한다
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public PaymentAuthorizationResult authorizeReady(Long paymentId) {
        var payment = creationService.snapshot(paymentId);
        return authorizationService.authorize(evaluationContext(payment, creationService.features(paymentId)));
    }

    private PaymentAuthorizationContext createEvaluationContext(PaymentEvaluationFlowInput input) {
        if (input == null) {
            throw new IllegalArgumentException("input must not be null");
        }
        var payment = creationService.createPendingSnapshot(
                input.merchantId(), input.customerRef(), input.orderRef(), input.amount());
        return evaluationContext(payment, creationService.features(payment.paymentId()));
    }

    private PaymentAuthorizationContext evaluationContext(
            PaymentCreationSnapshot payment, PaymentCreationService.Features features) {
        if (payment.status() != PaymentStatus.PENDING || payment.authorizationRef() != null) {
            throw new IllegalStateException("최초 저장한 결제가 승인 전 PENDING 상태가 아닙니다");
        }
        var state = new PaymentRules.State(payment.status(), PaymentRules.AuthorizationStatus.NOT_REQUESTED);
        var evaluationInput = PaymentEvaluationInput.builder()
                .evaluationRequestId(UUID.randomUUID())
                .paymentId(payment.paymentId())
                .customerRef(payment.customerRef())
                .amount(payment.amount())
                .paymentRequestedAt(payment.createdAt())
                .merchantId(features == null ? null : features.merchantId())
                .cardFingerprint(features == null ? null : features.cardFingerprint())
                .deviceId(features == null ? null : features.deviceId())
                .clientIp(features == null ? null : features.clientIp())
                .clientCountry(features == null ? null : features.clientCountry())
                .clientIpType(features == null ? null : features.clientIpType())
                .buyerEmail(features == null ? null : features.buyerEmail())
                .hasPriorCapturedPayment(features == null ? null : features.hasPriorCapturedPayment())
                .cardCompletedPayments(features == null ? null : features.cardCompletedPayments())
                .deviceCompletedPayments(features == null ? null : features.deviceCompletedPayments())
                .build();
        var result = evaluationService.evaluateAndDecide(state, evaluationInput);
        return new PaymentAuthorizationContext(payment, evaluationInput.evaluationRequestId(), result);
    }
}
