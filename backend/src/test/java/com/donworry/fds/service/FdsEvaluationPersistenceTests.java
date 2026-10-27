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
    // 시나리오 ①: 평소 4만 원 고객이 처음 쓰는 카드로 65만 원 → 시드 Rule 3개 55점 REVIEW로 저장 (#82)
    void evaluate_scenarioOne_persistsReviewWithRuleHits() {
        var requestedAt = Instant.parse("2026-10-27T01:00:00Z");

        var result = evaluator.evaluate(
                new FdsEvaluationRequest(UUID.randomUUID(), 3L, "hong-gildong", 650_000L, requestedAt, 40_000L, 0));

        assertThat(result.result()).isEqualTo(FdsResult.REVIEW);
        assertThat(result.riskScore()).isEqualTo(55);
        assertThat(evaluationRepository.findAll()).singleElement().satisfies(evaluation -> {
            assertThat(evaluation.getPaymentRequestedAt()).isEqualTo(requestedAt);
            assertThat(evaluation.getRuleHits()).hasSize(3);
        });
    }

    private FdsEvaluationRequest request(Long paymentId, String orderRef, long amount, Instant requestedAt) {
        return new FdsEvaluationRequest(UUID.randomUUID(), paymentId, "hong-gildong", amount, requestedAt);
    }
}
