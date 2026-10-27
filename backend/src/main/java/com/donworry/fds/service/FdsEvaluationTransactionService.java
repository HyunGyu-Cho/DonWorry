package com.donworry.fds.service;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsEvaluationResponse;
import com.donworry.fds.api.FdsResult;
import com.donworry.fds.entity.FdsEvaluation;
import com.donworry.fds.repository.FdsEvaluationRepository;
import com.donworry.fds.repository.FdsRuleRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class FdsEvaluationTransactionService {

    // 결제 판정 구간 — 40점 이상 직원 확인(REVIEW), 70점 이상 거절(DENY) (화면 경보 목록 안내와 같다)
    private static final int REVIEW_MIN_SCORE = 40;
    private static final int DENY_MIN_SCORE = 70;

    private final FdsEvaluationRepository evaluationRepository;
    private final FdsRuleRepository ruleRepository;

    FdsEvaluationTransactionService(FdsEvaluationRepository evaluationRepository, FdsRuleRepository ruleRepository) {
        this.evaluationRepository = evaluationRepository;
        this.ruleRepository = ruleRepository;
    }

    @Transactional
    public FdsEvaluationResponse evaluate(FdsEvaluationRequest request) {
        var existing = evaluationRepository.findByEvaluationRequestId(request.evaluationRequestId());
        if (existing.isPresent()) {
            return responseOf(existing.get());
        }
        // 켜진 결제 Rule만, 기준값 · 점수는 fds_rules에서 (#82 — 시나리오 ①의 3개부터, 나머지는 2-5)
        var hits = PaymentRuleSet.evaluate(request, ruleRepository.findAllByOrderByRuleIdAsc());
        var score = hits.stream().mapToInt(PaymentRuleSet.Hit::score).sum();
        var evaluatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        var evaluation = FdsEvaluation.completed(request, resultFor(score), score, evaluatedAt);
        for (var hit : hits) {
            evaluation.addRuleHit(
                    hit.ruleCode(),
                    hit.outcome(),
                    hit.score(),
                    hit.ruleName(),
                    hit.threshold(),
                    hit.observed(),
                    null,
                    null);
        }
        return responseOf(evaluationRepository.saveAndFlush(evaluation));
    }

    private FdsEvaluationResponse responseOf(FdsEvaluation evaluation) {
        return new FdsEvaluationResponse(
                evaluation.getEvaluationRequestId(),
                evaluation.getEvaluationId(),
                evaluation.getResult(),
                evaluation.getRiskScore(),
                evaluation.getEvaluatedAt(),
                evaluation.getErrorCode());
    }

    private FdsResult resultFor(int score) {
        if (score >= DENY_MIN_SCORE) {
            return FdsResult.DENY;
        }
        if (score >= REVIEW_MIN_SCORE) {
            return FdsResult.REVIEW;
        }
        return FdsResult.ALLOW;
    }
}
