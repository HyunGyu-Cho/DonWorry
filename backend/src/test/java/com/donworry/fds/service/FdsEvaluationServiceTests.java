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
    // 시나리오 ①: 65만 원 · 처음 쓰는 카드 → R01 고액 30 + R03 결제 이력 없는 카드 25 = 55점 REVIEW (#96)
    void 시연1흐름_단골처음카드60만원대_55점REVIEW() {
        stubSave(1L);
        when(ruleRepository.findActiveCatalog()).thenReturn(seedRules());

        var result = transactionEvaluator.evaluate(featureRequest(650_000L, true, 0));

        assertThat(result.result()).isEqualTo(FdsResult.REVIEW);
        assertThat(result.riskScore()).isEqualTo(55);
        var hits = savedHits();
        assertThat(hits).extracting("ruleCode").containsExactly("HIGH_AMOUNT", "NEW_CARD");
        assertThat(hits).extracting("appliedScore").containsExactly(30, 25);
        assertThat(hits.get(0).getObservedValue()).isEqualTo("{\"amount\":650000,\"text\":\"65만 원\"}");
    }

    @Test
    // 카드를 모르면 R03은 확인 불가(0점) — 점수를 추정하지 않는다
    void evaluate_unknownCard_marksUnavailable() {
        stubSave(2L);
        when(ruleRepository.findActiveCatalog()).thenReturn(seedRules());

        var result = transactionEvaluator.evaluate(featureRequest(1_200_000L, null, null));

        assertThat(result.riskScore()).isEqualTo(30);
        assertThat(result.result()).isEqualTo(FdsResult.ALLOW);
        assertThat(savedHits())
                .extracting("outcome")
                .containsExactly(
                        com.donworry.fds.api.FdsRuleHitOutcome.MATCH,
                        com.donworry.fds.api.FdsRuleHitOutcome.UNAVAILABLE);
    }

    @Test
    // 꺼진 Rule과 폐지된 옛 Rule(평소보다 큰 금액 · 신규 계정 · 해외/익명)은 계산 · 기록하지 않는다 (#96)
    void 룰계산_꺼진옛룰3개_점수기록없음() {
        stubSave(3L);
        var rules = new java.util.ArrayList<>(seedRules());
        rules.add(retired(rule("AMOUNT_SPIKE", 20, java.util.Map.of("multiplier", 5), true)));
        rules.add(rule("NEW_ACCOUNT", 20, null, false));
        rules.add(retired(rule("GEO_MISMATCH", 25, null, false)));
        when(ruleRepository.findActiveCatalog()).thenReturn(rules);

        var result = transactionEvaluator.evaluate(featureRequest(650_000L, true, 0));

        assertThat(result.riskScore()).isEqualTo(55);
        assertThat(savedHits()).extracting("ruleCode").containsExactly("HIGH_AMOUNT", "NEW_CARD");
    }

    @Test
    // 합계가 100을 넘으면 화면 점수는 100, 원래 합계는 raw_score에 남긴다 (#96)
    void 평가저장_합계110점_표시100원점수110DENY() {
        stubSave(4L);
        when(ruleRepository.findActiveCatalog())
                .thenReturn(List.of(
                        rule("HIGH_AMOUNT", 60, java.util.Map.of("minAmount", 500000), true),
                        rule("NEW_CARD", 50, null, true)));

        var result = transactionEvaluator.evaluate(featureRequest(650_000L, true, 0));

        assertThat(result.riskScore()).isEqualTo(100);
        assertThat(result.result()).isEqualTo(FdsResult.DENY);
        verify(evaluationRepository).saveAndFlush(evaluationCaptor.capture());
        assertThat(evaluationCaptor.getValue().getRawScore()).isEqualTo(110);
        assertThat(evaluationCaptor.getValue().getRiskScore()).isEqualTo(100);
    }

    @Test
    // R02: 과거 정상 결제가 있는 단골이 처음 보는 기기로 결제하면 +25 (#98 F-4)
    void R02_과거정상결제있고처음기기_25점() {
        stubSave(5L);
        when(ruleRepository.findActiveCatalog()).thenReturn(List.of(rule("NEW_DEVICE", 25, null, true)));

        var result = transactionEvaluator.evaluate(deviceRequest(40_000L, true, 3, "DEV-NEW-PHONE", 0));

        assertThat(result.riskScore()).isEqualTo(25);
        assertThat(savedHits()).singleElement().satisfies(hit -> {
            assertThat(hit.getOutcome()).isEqualTo(com.donworry.fds.api.FdsRuleHitOutcome.MATCH);
            assertThat(hit.getObservedValue()).contains("이 기기로 완료한 결제 0건");
        });
    }

    @Test
    // 과거 정상 결제가 없는 첫 손님 · 기기를 모르는 결제는 새 기기 · 새 카드를 판단하지 않는다 (확인 불가, 0점) (#98 F-4)
    void R02R03_과거정상결제없음_기기모름_확인불가0점() {
        stubSave(7L);
        var rules = List.of(rule("NEW_DEVICE", 25, null, true), rule("NEW_CARD", 25, null, true));
        when(ruleRepository.findActiveCatalog()).thenReturn(rules);

        var firstVisit = transactionEvaluator.evaluate(deviceRequest(40_000L, false, 0, "DEV-NEW-PHONE", 0));
        var unknownDevice = transactionEvaluator.evaluate(deviceRequest(40_000L, true, 3, null, null));

        assertThat(firstVisit.riskScore()).isZero();
        assertThat(unknownDevice.riskScore()).isZero();
        verify(evaluationRepository, org.mockito.Mockito.times(2)).saveAndFlush(evaluationCaptor.capture());
        var first = evaluationCaptor.getAllValues().get(0).getRuleHits();
        assertThat(first).extracting("outcome").containsOnly(com.donworry.fds.api.FdsRuleHitOutcome.UNAVAILABLE);
        assertThat(first.get(0).getObservedValue()).contains("비교할 과거 정상 결제 없음");
        var device = evaluationCaptor.getAllValues().get(1).getRuleHits().get(0);
        assertThat(device.getOutcome()).isEqualTo(com.donworry.fds.api.FdsRuleHitOutcome.UNAVAILABLE);
        assertThat(device.getObservedValue()).contains("기기 정보 없음");
    }

    @Test
    // 룰안 시나리오: 기존 구매자가 새 기기 + 새 카드로 결제하면 R02 25 + R03 25 = 50점 직원 확인 (#98 F-4)
    void 단골_새기기새카드_50점REVIEW() {
        stubSave(6L);
        var rules = new java.util.ArrayList<>(seedRules());
        rules.add(1, rule("NEW_DEVICE", 25, null, true));
        when(ruleRepository.findActiveCatalog()).thenReturn(rules);

        var result = transactionEvaluator.evaluate(deviceRequest(40_000L, true, 0, "DEV-NEW-PHONE", 0));

        assertThat(result.riskScore()).isEqualTo(50);
        assertThat(result.result()).isEqualTo(FdsResult.REVIEW);
        assertThat(savedHits()).extracting("ruleCode").containsExactly("HIGH_AMOUNT", "NEW_DEVICE", "NEW_CARD");
    }

    @Test
    // R05: 고위험 국가 IP면 +40, 목록 밖 나라는 0점, 이름표에 없는 IP는 확인 불가 (#98 F-6)
    void R05_고위험국가40점_목록밖0점_이름표없음확인불가() {
        stubSave(8L);
        when(ruleRepository.findActiveCatalog())
                .thenReturn(List.of(rule(
                        "HIGH_RISK_COUNTRY_IP", 40, java.util.Map.of("countries", List.of("RU", "VN", "NL")), true)));

        var vpn = transactionEvaluator.evaluate(countryRequest("NL", "ANONYMOUS"));
        var domestic = transactionEvaluator.evaluate(countryRequest("KR", "DOMESTIC"));
        var unknown = transactionEvaluator.evaluate(countryRequest(null, null));

        assertThat(vpn.riskScore()).isEqualTo(40);
        assertThat(domestic.riskScore()).isZero();
        assertThat(unknown.riskScore()).isZero();
        verify(evaluationRepository, org.mockito.Mockito.times(3)).saveAndFlush(evaluationCaptor.capture());
        var hits = evaluationCaptor.getAllValues().stream()
                .map(e -> e.getRuleHits().get(0))
                .toList();
        assertThat(hits)
                .extracting("outcome")
                .containsExactly(
                        com.donworry.fds.api.FdsRuleHitOutcome.MATCH,
                        com.donworry.fds.api.FdsRuleHitOutcome.NO_MATCH,
                        com.donworry.fds.api.FdsRuleHitOutcome.UNAVAILABLE);
        assertThat(hits.get(0).getObservedValue()).contains("네덜란드 IP (VPN · Tor)");
    }

    private FdsEvaluationRequest countryRequest(String country, String ipType) {
        return FdsEvaluationRequest.builder()
                .evaluationRequestId(UUID.randomUUID())
                .paymentId(4L)
                .merchantId(1L)
                .customerRef("c-0601")
                .amount(12_000L)
                .paymentRequestedAt(Instant.parse("2026-10-27T01:00:00Z"))
                .clientIp("45.83.64.12")
                .clientCountry(country)
                .clientIpType(ipType)
                .build();
    }

    @Test
    // 판정 구간 경계 — 0~49 통과 · 50~79 직원 확인 · 80 이상 거절 (#96, ADR-0023)
    void 판정구간_49_50_79_80점_ALLOW_REVIEW_REVIEW_DENY() {
        assertThat(FdsEvaluationTransactionService.resultFor(49)).isEqualTo(FdsResult.ALLOW);
        assertThat(FdsEvaluationTransactionService.resultFor(50)).isEqualTo(FdsResult.REVIEW);
        assertThat(FdsEvaluationTransactionService.resultFor(79)).isEqualTo(FdsResult.REVIEW);
        assertThat(FdsEvaluationTransactionService.resultFor(80)).isEqualTo(FdsResult.DENY);
    }

    @Test
    // 룰 계산 중 예외가 나도 결제 흐름에 예외를 던지지 않고 ERROR 평가(점수 없음 · 오류 코드)를 남긴다 (#96 F-2)
    void FDS평가_룰계산중예외_ERROR평가저장_예외없음() {
        var request = request(5L, 650_000L, Instant.parse("2026-10-27T01:00:00Z"));
        var error = com.donworry.fds.api.FdsEvaluationResponse.builder()
                .evaluationRequestId(request.evaluationRequestId())
                .evaluationId(9L)
                .result(FdsResult.ERROR)
                .evaluatedAt(Instant.parse("2026-10-27T01:00:01Z"))
                .errorCode(FdsEvaluationService.RULE_EVALUATION_FAILED)
                .build();
        when(transactionService.evaluate(request)).thenThrow(new NumberFormatException("broken threshold"));
        when(transactionService.recordError(request, FdsEvaluationService.RULE_EVALUATION_FAILED))
                .thenReturn(error);

        assertThat(evaluator.evaluate(request)).isSameAs(error);

        // 저장되는 ERROR 평가는 점수 · 원점수가 없고 오류 코드가 있다
        stubSave(9L);
        var recorded = transactionEvaluator.recordError(request, FdsEvaluationService.RULE_EVALUATION_FAILED);
        assertThat(recorded.result()).isEqualTo(FdsResult.ERROR);
        assertThat(recorded.riskScore()).isNull();
        verify(evaluationRepository).saveAndFlush(evaluationCaptor.capture());
        assertThat(evaluationCaptor.getValue().getRawScore()).isNull();
        assertThat(evaluationCaptor.getValue().getErrorCode()).isEqualTo("FDS_RULE_EVALUATION_FAILED");
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

    private void stubSave(long evaluationId) {
        when(evaluationRepository.findByEvaluationRequestId(any())).thenReturn(Optional.empty());
        when(evaluationRepository.saveAndFlush(any(FdsEvaluation.class))).thenAnswer(invocation -> {
            var evaluation = invocation.getArgument(0, FdsEvaluation.class);
            org.springframework.test.util.ReflectionTestUtils.setField(evaluation, "evaluationId", evaluationId);
            return evaluation;
        });
    }

    private List<com.donworry.fds.entity.FdsRuleHit> savedHits() {
        verify(evaluationRepository).saveAndFlush(evaluationCaptor.capture());
        return evaluationCaptor.getValue().getRuleHits();
    }

    private static FdsRule retired(FdsRule rule) {
        org.springframework.test.util.ReflectionTestUtils.setField(
                rule, "retiredAt", Instant.parse("2026-10-27T12:00:00Z"));
        return rule;
    }

    private FdsEvaluationRequest featureRequest(long amount, Boolean hasPriorCaptured, Integer cardCompleted) {
        return deviceRequest(amount, hasPriorCaptured, cardCompleted, null, null);
    }

    private FdsEvaluationRequest deviceRequest(
            long amount, Boolean hasPriorCaptured, Integer cardCompleted, String deviceId, Integer deviceCompleted) {
        return FdsEvaluationRequest.builder()
                .evaluationRequestId(UUID.randomUUID())
                .paymentId(3L)
                .merchantId(1L)
                .customerRef("kim-minsu")
                .amount(amount)
                .paymentRequestedAt(Instant.parse("2026-10-27T01:00:00Z"))
                .hasPriorCapturedPayment(hasPriorCaptured)
                .cardCompletedPayments(cardCompleted)
                .deviceId(deviceId)
                .deviceCompletedPayments(deviceCompleted)
                .build();
    }

    // fds_rules 시드와 같은 값 (V20261027_211105)
    private static List<FdsRule> seedRules() {
        return List.of(
                rule("HIGH_AMOUNT", 30, java.util.Map.of("minAmount", 500000), true), rule("NEW_CARD", 25, null, true));
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
