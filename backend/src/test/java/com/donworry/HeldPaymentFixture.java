package com.donworry;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsResult;
import com.donworry.fds.api.FdsRuleHitOutcome;
import com.donworry.fds.entity.FdsEvaluation;
import com.donworry.fds.repository.FdsEvaluationRepository;
import com.donworry.investigation.service.CaseIntakeService;
import com.donworry.investigation.service.HeldPayment;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.test.context.TestComponent;

// 테스트용 매입 보류 결제 — 실제 payments · fds_evaluations에 저장한다 (#82, 지운 MockPaymentInfoStore 대신)
// 점수는 첫 Rule에 몰아 준다. 사건까지 만들려면 held()
@TestComponent
public class HeldPaymentFixture {

    private final PaymentRepository paymentRepository;
    private final FdsEvaluationRepository fdsEvaluationRepository;
    private final CaseIntakeService caseIntakeService;

    public HeldPaymentFixture(
            PaymentRepository paymentRepository,
            FdsEvaluationRepository fdsEvaluationRepository,
            CaseIntakeService caseIntakeService) {
        this.paymentRepository = paymentRepository;
        this.fdsEvaluationRepository = fdsEvaluationRepository;
        this.caseIntakeService = caseIntakeService;
    }

    public record Held(Long paymentId, Long caseId) {}

    public Long payment(long merchantId, String customerRef, long amount, int riskScore, List<String> ruleHits) {
        // 이메일은 고객마다 달라야 비슷한 과거 사건(같은 이메일)이 다른 테스트 사건과 겹치지 않는다 (#104)
        return payment(
                merchantId,
                customerRef,
                amount,
                riskScore,
                ruleHits,
                new Checkout(customerRef + "@example.com", null, null, null));
    }

    // 결제창 값 — 비슷한 과거 사건 테스트용 (#104). 카드 지문이 없으면 결제창을 거치지 않은 결제
    public record Checkout(String buyerEmail, String clientIp, String deviceId, String cardFingerprint) {}

    public Long payment(
            long merchantId, String customerRef, long amount, int riskScore, List<String> ruleHits, Checkout checkout) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Payment payment = Payment.ready(
                new Payment.Order(
                        merchantId,
                        customerRef,
                        "T-" + UUID.randomUUID(),
                        "테스트 케이크",
                        amount,
                        "테스트 고객",
                        checkout.buyerEmail(),
                        now,
                        null),
                now);
        if (checkout.cardFingerprint() != null) {
            payment.attachCheckout(checkout.clientIp(), checkout.deviceId(), checkout.cardFingerprint(), "1234", "KR");
        }
        payment.recordAuthorizationSuccess("TEST-AUTH-" + UUID.randomUUID(), true);
        Long paymentId = paymentRepository.save(payment).getPaymentId();
        FdsEvaluation evaluation = FdsEvaluation.completed(
                new FdsEvaluationRequest(UUID.randomUUID(), paymentId, customerRef, amount, now),
                FdsResult.REVIEW,
                riskScore,
                now);
        for (int i = 0; i < ruleHits.size(); i++) {
            evaluation.addRuleHit(ruleHits.get(i), FdsRuleHitOutcome.MATCH, i == 0 ? riskScore : 0, ruleHits.get(i));
        }
        fdsEvaluationRepository.saveAndFlush(evaluation);
        return paymentId;
    }

    public Long payment(long amount, int riskScore, List<String> ruleHits) {
        return payment(1L, "customer-" + UUID.randomUUID(), amount, riskScore, ruleHits);
    }

    // 결제 + 사건 접수 (P5 매입 보류 이벤트와 같은 길)
    public Held held(long merchantId, String customerRef, long amount, int riskScore) {
        Long paymentId = payment(merchantId, customerRef, amount, riskScore, List.of("NEW_CARD", "HIGH_AMOUNT"));
        Long caseId = caseIntakeService.receive(
                new HeldPayment(paymentId, merchantId, customerRef, amount, "TEST-AUTH", null, Instant.now()));
        return new Held(paymentId, caseId);
    }
}
