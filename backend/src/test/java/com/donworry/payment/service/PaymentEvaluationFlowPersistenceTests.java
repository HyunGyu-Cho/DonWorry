package com.donworry.payment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.api.FdsResult;
import com.donworry.payment.entity.PaymentStatus;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
class PaymentEvaluationFlowPersistenceTests {
    @Autowired
    PaymentEvaluationFlowService service;

    @Autowired
    PaymentRepository payments;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    PlatformTransactionManager transactionManager;

    private PaymentEvaluationFlowInput input(String customer, long amount) {
        return PaymentEvaluationFlowInput.builder()
                .merchantId(999L)
                .customerRef(customer)
                .orderRef(UUID.randomUUID().toString())
                .amount(amount)
                .build();
    }

    // 실제 P2 평가가 저장된 결제의 고객·금액·시각으로 실행되고 평가 한 건만 남는다
    @Test
    void createAndEvaluate_withRealEvaluator_persistsMatchingEvaluation() {
        // 이력 · 카드가 없으면 고액 결제만 판단한다 — 50만 원 이상 30점 (#96)
        var result = service.createAndEvaluate(input(UUID.randomUUID().toString(), 1_000_000L));
        assertThat(result.evaluationResult().evaluation().result()).isEqualTo(FdsResult.ALLOW);
        assertThat(result.evaluationResult().evaluation().riskScore()).isEqualTo(30);
        assertStored(result);
    }

    // 평소 4만 원인 고객의 60만 원 결제는 R01 고액 30점만 — 카드가 없는 평가라 R03은 확인 불가, 50점 미만 ALLOW (#96)
    @Test
    void createAndEvaluate_highAmountWithoutCard_allowsWithoutAuthorization() {
        String customer = UUID.randomUUID().toString();
        capturedHistory(customer);
        var result = service.createAndEvaluate(input(customer, 600_000L));
        assertThat(result.evaluationResult().evaluation().result()).isEqualTo(FdsResult.ALLOW);
        assertThat(result.evaluationResult().evaluation().riskScore()).isEqualTo(30);
        assertStored(result);
    }

    // 호출자 롤백 이후에도 최초 결제와 실제 P2 평가가 각각 커밋된 채 남는다
    @Test
    void createAndEvaluate_whenCallerRollsBack_preservesPaymentAndEvaluation() {
        var transactions = new TransactionTemplate(transactionManager);
        var result = transactions.execute(status -> {
            var created = service.createAndEvaluate(input(UUID.randomUUID().toString(), 150_000L));
            status.setRollbackOnly();
            return created;
        });
        assertStored(result);
    }

    private void assertStored(PaymentEvaluationFlowResult result) {
        var payment = payments.findById(result.paymentId()).orElseThrow();
        var evaluation = result.evaluationResult().evaluation();
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(payment.getAuthorizationRef()).isNull();
        assertThat(result.evaluationResult().decision().nextStep())
                .isEqualTo(PaymentRules.NextStep.REQUEST_AUTHORIZATION);
        // DB 조회는 통합 테스트의 검증용이며 운영 코드에서는 P2 공개 API만 호출한다.
        assertThat(jdbc.queryForObject(
                        "SELECT COUNT(*) FROM fds_evaluations WHERE payment_id = ?",
                        Long.class,
                        payment.getPaymentId()))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                        """
                SELECT COUNT(*) FROM fds_evaluations e JOIN payments p ON p.payment_id = e.payment_id
                WHERE e.evaluation_id = ? AND p.payment_id = ?
                  AND e.customer_ref = p.customer_ref AND e.payment_requested_at = p.created_at
                  AND e.result = ?
                """,
                        Long.class,
                        evaluation.evaluationId(),
                        payment.getPaymentId(),
                        evaluation.result().name()))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject("""
                SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(observed_value, '$.amount')) AS SIGNED)
                FROM fds_rule_hits WHERE evaluation_id = ? AND rule_code = 'HIGH_AMOUNT'
                """, Long.class, evaluation.evaluationId()))
                .isEqualTo(payment.getAmount());
    }

    // 이 고객의 매입 완료 이력 (평균 4만 원) — 평소보다 큰 금액 Rule이 판단할 수 있게 (#82)
    private void capturedHistory(String customer) {
        for (int i = 0; i < 2; i++) {
            var past = com.donworry.payment.entity.Payment.pending(
                    999L, customer, UUID.randomUUID().toString(), 40_000L, Instant.now());
            past.recordAuthorizationSuccess("PAST-" + UUID.randomUUID(), false);
            past.completeCapture();
            payments.save(past);
        }
    }
}
