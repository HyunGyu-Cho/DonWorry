package com.donworry.fds.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsResult;
import com.donworry.fds.repository.FdsEvaluationRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
@Transactional
class FdsEvaluationPersistenceTests {

    @Autowired
    private FdsEvaluationService evaluator;

    @Autowired
    private FdsEvaluationRepository evaluationRepository;

    @BeforeEach
    void setUp() {
        evaluationRepository.deleteAll();
    }

    @Test
    // 시나리오 ①: 평소 4만 원 고객이 처음 쓰는 카드로 65만 원 → R01 30 + R03 25 = 55점 REVIEW로 저장 (#96)
    void evaluate_scenarioOne_persistsReviewWithRuleHits() {
        var requestedAt = Instant.parse("2026-10-27T01:00:00Z");

        var result = evaluator.evaluate(FdsEvaluationRequest.builder()
                .evaluationRequestId(UUID.randomUUID())
                .paymentId(3L)
                .merchantId(1L)
                .customerRef("hong-gildong")
                .amount(650_000L)
                .paymentRequestedAt(requestedAt)
                .hasPriorCapturedPayment(true)
                .cardCompletedPayments(0)
                .build());

        assertThat(result.result()).isEqualTo(FdsResult.REVIEW);
        assertThat(result.riskScore()).isEqualTo(55);
        assertThat(evaluationRepository.findAll()).singleElement().satisfies(evaluation -> {
            assertThat(evaluation.getPaymentRequestedAt()).isEqualTo(requestedAt);
            assertThat(evaluation.getRawScore()).isEqualTo(55);
            assertThat(evaluation.getMerchantId()).isEqualTo(1L);
            assertThat(evaluation.getRuleHits()).hasSize(2);
        });
    }

    private FdsEvaluationRequest request(Long paymentId, String orderRef, long amount, Instant requestedAt) {
        return new FdsEvaluationRequest(UUID.randomUUID(), paymentId, "hong-gildong", amount, requestedAt);
    }
}
