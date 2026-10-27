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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class FdsEvaluationTransactionService {

    // 결제 판정 구간 — 50점 이상 직원 확인(REVIEW), 80점 이상 거절(DENY) (#96, ADR-0023 · 화면 경보 안내와 같다)
    static final int REVIEW_MIN_SCORE = 50;
    static final int DENY_MIN_SCORE = 80;
    // 화면에 보이는 점수 상한. 원래 합계는 raw_score에 남긴다
    static final int MAX_DISPLAY_SCORE = 100;

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
        // 폐지 안 된 켜진 결제 Rule만, 기준값 · 점수는 fds_rules에서 (#82 · #96)
        var hits = PaymentRuleSet.evaluate(request, ruleRepository.findActiveCatalog());
        var rawScore = hits.stream().mapToInt(PaymentRuleSet.Hit::score).sum();
        var evaluatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        var evaluation = FdsEvaluation.completed(
                request, resultFor(rawScore), Math.min(MAX_DISPLAY_SCORE, rawScore), rawScore, evaluatedAt);
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

    // 룰 계산이 실패한 요청을 ERROR 평가로 남긴다 (#96 F-2). 실패한 계산의 트랜잭션과 따로 커밋한다
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FdsEvaluationResponse recordError(FdsEvaluationRequest request, String errorCode) {
        var existing = evaluationRepository.findByEvaluationRequestId(request.evaluationRequestId());
        if (existing.isPresent()) {
            return responseOf(existing.get());
        }
        var evaluatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        return responseOf(evaluationRepository.saveAndFlush(FdsEvaluation.failed(request, errorCode, evaluatedAt)));
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

    static FdsResult resultFor(int score) {
        if (score >= DENY_MIN_SCORE) {
            return FdsResult.DENY;
        }
        if (score >= REVIEW_MIN_SCORE) {
            return FdsResult.REVIEW;
        }
        return FdsResult.ALLOW;
    }
}
