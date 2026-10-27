package com.donworry.fds.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsResult;
import com.donworry.fds.entity.FdsEvaluation;
import com.donworry.fds.entity.FdsRule;
import com.donworry.fds.repository.FdsEvaluationRepository;
import com.donworry.fds.repository.FdsRuleRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FdsEvaluationServiceTests {

    @Mock
    private FdsEvaluationRepository evaluationRepository;

    @Mock
    private FdsEvaluationTransactionService transactionService;

    @Mock
    private FdsRuleRepository ruleRepository;

    @Captor
    private ArgumentCaptor<FdsEvaluation> evaluationCaptor;

    private FdsEvaluationTransactionService transactionEvaluator;

    private FdsEvaluationService evaluator;

    @BeforeEach
    void setUp() {
        transactionEvaluator = new FdsEvaluationTransactionService(evaluationRepository, ruleRepository);
        evaluator = new FdsEvaluationService(evaluationRepository, transactionService);
    }

    @Test
    // 시나리오 ①: 65만 원 · 평소 4만 원 · 처음 쓰는 카드 → 고액 20 + 평소보다 큰 금액 20 + 처음 쓰는 카드 15 = 55점 REVIEW (#82)
    void evaluate_scenarioOne_scoresThreeRulesFromCatalog() {
        when(evaluationRepository.findByEvaluationRequestId(any())).thenReturn(Optional.empty());
        when(ruleRepository.findAllByOrderByRuleIdAsc()).thenReturn(seedRules());
        when(evaluationRepository.saveAndFlush(any(FdsEvaluation.class))).thenAnswer(invocation -> {
            var evaluation = invocation.getArgument(0, FdsEvaluation.class);
            org.springframework.test.util.ReflectionTestUtils.setField(evaluation, "evaluationId", 1L);
            return evaluation;
        });

        var result = transactionEvaluator.evaluate(featureRequest(650_000L, 40_000L, 0));

        assertThat(result.result()).isEqualTo(FdsResult.REVIEW);
        assertThat(result.riskScore()).isEqualTo(55);
        verify(evaluationRepository).saveAndFlush(evaluationCaptor.capture());
        var hits = evaluationCaptor.getValue().getRuleHits();
        assertThat(hits).extracting("ruleCode").containsExactly("HIGH_AMOUNT", "AMOUNT_SPIKE", "NEW_CARD");
        assertThat(hits).extracting("appliedScore").containsExactly(20, 20, 15);
        assertThat(hits.get(0).getObservedValue()).isEqualTo("{\"amount\":650000,\"text\":\"65만 원\"}");
        assertThat(hits.get(1).getObservedValue()).contains("평소 4만 원의 16배 (기준 5배)");
    }

    @Test
    // 이력 · 카드를 모르면 그 Rule은 확인 불가(0점) — 점수를 추정하지 않는다. 100만 원 이상은 35점
    void evaluate_unknownHistory_marksUnavailable() {
        when(evaluationRepository.findByEvaluationRequestId(any())).thenReturn(Optional.empty());
        when(ruleRepository.findAllByOrderByRuleIdAsc()).thenReturn(seedRules());
        when(evaluationRepository.saveAndFlush(any(FdsEvaluation.class))).thenAnswer(invocation -> {
            var evaluation = invocation.getArgument(0, FdsEvaluation.class);
            org.springframework.test.util.ReflectionTestUtils.setField(evaluation, "evaluationId", 2L);
            return evaluation;
        });

        var result = transactionEvaluator.evaluate(featureRequest(1_200_000L, null, null));

        assertThat(result.riskScore()).isEqualTo(35);
        assertThat(result.result()).isEqualTo(FdsResult.ALLOW);
        verify(evaluationRepository).saveAndFlush(evaluationCaptor.capture());
        assertThat(evaluationCaptor.getValue().getRuleHits())
                .extracting("outcome")
                .containsExactly(
                        com.donworry.fds.api.FdsRuleHitOutcome.MATCH,
                        com.donworry.fds.api.FdsRuleHitOutcome.UNAVAILABLE,
                        com.donworry.fds.api.FdsRuleHitOutcome.UNAVAILABLE);
    }

    @Test
    // 꺼진 Rule은 계산하지 않는다. 70점 이상이면 거절(DENY)
    void evaluate_disabledRuleSkippedAndHighScoreDenied() {
        when(evaluationRepository.findByEvaluationRequestId(any())).thenReturn(Optional.empty());
        var rules = new java.util.ArrayList<>(seedRules());
        rules.add(rule("NEW_ACCOUNT", 20, null, false));
        when(ruleRepository.findAllByOrderByRuleIdAsc()).thenReturn(rules);
        when(evaluationRepository.saveAndFlush(any(FdsEvaluation.class))).thenAnswer(invocation -> {
            var evaluation = invocation.getArgument(0, FdsEvaluation.class);
            org.springframework.test.util.ReflectionTestUtils.setField(evaluation, "evaluationId", 2L);
            return evaluation;
        });

        var result = transactionEvaluator.evaluate(featureRequest(1_000_000L, 40_000L, 0));

        assertThat(result.riskScore()).isEqualTo(70);
        assertThat(result.result()).isEqualTo(FdsResult.DENY);
    }

    @Test
    // 같은 요청 ID로 재호출하면 기존 평가 결과를 반환한다.
    void evaluate_existingRequestId_returnsStoredEvaluation() {
        var request = request(1L, 150_000L, Instant.parse("2026-10-22T01:00:00Z"));
        var stored = FdsEvaluation.completed(request, FdsResult.REVIEW, 60, Instant.parse("2026-10-22T01:00:01Z"));
        org.springframework.test.util.ReflectionTestUtils.setField(stored, "evaluationId", 1L);
        when(evaluationRepository.findByEvaluationRequestId(request.evaluationRequestId()))
                .thenReturn(Optional.of(stored));

        var result = transactionEvaluator.evaluate(request);

        assertThat(result.evaluationId()).isEqualTo(1L);
        assertThat(result.result()).isEqualTo(FdsResult.REVIEW);
        verify(evaluationRepository).findByEvaluationRequestId(request.evaluationRequestId());
    }

    @Test
    // 같은 요청 ID의 동시 저장 충돌 뒤에는 이미 저장된 평가를 반환한다.
    void evaluate_whenConcurrentInsertConflicts_returnsStoredEvaluation() {
        var request = request(1L, 150_000L, Instant.parse("2026-10-22T01:00:00Z"));
        var stored = FdsEvaluation.completed(request, FdsResult.REVIEW, 60, Instant.parse("2026-10-22T01:00:01Z"));
        org.springframework.test.util.ReflectionTestUtils.setField(stored, "evaluationId", 1L);
        when(transactionService.evaluate(request))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("duplicate request"));
        when(evaluationRepository.findByEvaluationRequestId(request.evaluationRequestId()))
                .thenReturn(Optional.of(stored));

        var result = evaluator.evaluate(request);

        assertThat(result.evaluationId()).isEqualTo(1L);
    }

    private FdsEvaluationRequest featureRequest(long amount, Long average, Integer cardCompleted) {
        return new FdsEvaluationRequest(
                UUID.randomUUID(),
                3L,
                "kim-minsu",
                amount,
                Instant.parse("2026-10-27T01:00:00Z"),
                average,
                cardCompleted);
    }

    // fds_rules 시드와 같은 값 (V20261024_102018)
    private static List<FdsRule> seedRules() {
        return List.of(
                rule(
                        "HIGH_AMOUNT",
                        20,
                        java.util.Map.of(
                                "tiers",
                                List.of(
                                        java.util.Map.of("minAmount", 500000, "score", 20),
                                        java.util.Map.of("minAmount", 1000000, "score", 35))),
                        true),
                rule("AMOUNT_SPIKE", 20, java.util.Map.of("multiplier", 5), true),
                rule("NEW_CARD", 15, null, true));
    }

    private static FdsRule rule(String code, int score, java.util.Map<String, Object> threshold, boolean enabled) {
        FdsRule rule = org.springframework.beans.BeanUtils.instantiateClass(FdsRule.class);
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "ruleCode", code);
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "target", "PAYMENT");
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "displayName", code);
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "criteria", code + " 기준");
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "score", score);
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "threshold", threshold);
        org.springframework.test.util.ReflectionTestUtils.setField(rule, "enabled", enabled);
        return rule;
    }

    private FdsEvaluationRequest request(Long paymentId, long amount, Instant requestedAt) {
        return new FdsEvaluationRequest(UUID.randomUUID(), paymentId, "hong-gildong", amount, requestedAt);
    }
}
