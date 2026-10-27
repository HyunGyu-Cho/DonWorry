package com.donworry.investigation.service;

import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.fds.api.FdsPaymentEvaluations.PaymentEvaluation;
import com.donworry.payment.api.PaymentLookup;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

// 결제(P5) + 최신 FDS 평가(P2)를 합친다 (#82) — 평가가 없으면 점수 칸은 null (추정하지 않음)
@Component
@RequiredArgsConstructor
class PaymentInfoAdapter implements PaymentInfoReader {

    private final PaymentLookup paymentLookup;
    private final FdsPaymentEvaluations fdsPaymentEvaluations;

    @Override
    public Optional<PaymentInfo> find(Long paymentId) {
        return paymentLookup.find(paymentId).map(payment -> {
            Optional<PaymentEvaluation> evaluation = fdsPaymentEvaluations.latestForPayment(paymentId);
            return new PaymentInfo(
                    payment.paymentId(),
                    payment.amount(),
                    payment.status(),
                    payment.requestedAt(),
                    evaluation.map(PaymentEvaluation::riskScore).orElse(null),
                    evaluation.map(e -> e.result().name()).orElse(null),
                    evaluation.map(PaymentEvaluation::matchedRuleCodes).orElse(null),
                    evaluation.map(PaymentEvaluation::evaluationId).orElse(null),
                    payment.orderTitle(),
                    payment.buyerName(),
                    payment.customerRef());
        });
    }
}
