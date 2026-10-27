package com.donworry.fds.service;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsEvaluationResponse;
import com.donworry.fds.api.FdsResult;
import com.donworry.fds.api.FdsRuleHitOutcome;
import com.donworry.fds.entity.BlocklistEntry;
import com.donworry.fds.entity.FdsEvaluation;
import com.donworry.fds.entity.FdsRule;
import com.donworry.fds.repository.BlocklistEntryRepository;
import com.donworry.fds.repository.FdsEvaluationRepository;
import com.donworry.fds.repository.FdsRuleRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
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
    private final BlocklistEntryRepository blocklistRepository;

    FdsEvaluationTransactionService(
            FdsEvaluationRepository evaluationRepository,
            FdsRuleRepository ruleRepository,
            BlocklistEntryRepository blocklistRepository) {
        this.blocklistRepository = blocklistRepository;
        this.evaluationRepository = evaluationRepository;
        this.ruleRepository = ruleRepository;
    }

    @Transactional
    public FdsEvaluationResponse evaluate(FdsEvaluationRequest request) {
        var existing = evaluationRepository.findByEvaluationRequestId(request.evaluationRequestId());
        if (existing.isPresent()) {
            return responseOf(existing.get());
        }
        var rules = ruleRepository.findActiveCatalog();
        var evaluatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        // R07 차단 목록이 먼저 — 일치하면 다른 Rule 점수를 계산하지 않고 거절 (#100 F-10)
        var blocked = blocklistRepository.findActiveMatches(
                request.cardFingerprint(),
                request.deviceId(),
                request.clientIp(),
                BlocklistRegistryService.normalize("EMAIL", request.buyerEmail()),
                evaluatedAt);
        if (!blocked.isEmpty()) {
            return responseOf(
                    evaluationRepository.saveAndFlush(blocklisted(request, rules, blocked.getFirst(), evaluatedAt)));
        }
        // 폐지 안 된 켜진 결제 Rule만, 기준값 · 점수는 fds_rules에서 (#82 · #96)
        var hits = PaymentRuleSet.evaluate(request, rules);
        var rawScore = hits.stream().mapToInt(PaymentRuleSet.Hit::score).sum();
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

    // 차단 목록 일치 평가 — R07 한 줄 · 100점 DENY, 어느 차단 항목과 맞았는지 근거에 남긴다
    private static FdsEvaluation blocklisted(
            FdsEvaluationRequest request, List<FdsRule> rules, BlocklistEntry entry, Instant evaluatedAt) {
        var rule =
                rules.stream().filter(r -> "BLOCKLIST".equals(r.getRuleCode())).findFirst();
        int score = rule.map(FdsRule::getScore).orElse(MAX_DISPLAY_SCORE);
        var evaluation = FdsEvaluation.completed(
                request, FdsResult.DENY, Math.min(MAX_DISPLAY_SCORE, score), score, evaluatedAt);
        String what = switch (entry.getEntryType()) {
            case "CARD" -> "카드";
            case "DEVICE" -> "기기";
            case "IP" -> "접속 IP";
            default -> "이메일";
        };
        String text = what + "가 차단 목록과 일치 (차단 #" + entry.getEntryId() + ")";
        evaluation.addRuleHit(
                "BLOCKLIST",
                FdsRuleHitOutcome.MATCH,
                score,
                rule.map(FdsRule::getDisplayName).orElse("차단 목록 일치"),
                rule.map(r -> "{\"text\":\"" + r.getCriteria().replace("\"", "\\\"") + "\"}")
                        .orElse(null),
                "{\"entryType\":\"" + entry.getEntryType() + "\",\"text\":\"" + text + "\"}",
                "{\"blocklistEntryId\":" + entry.getEntryId() + ",\"entryType\":\"" + entry.getEntryType() + "\"}",
                null,
                null);
        return evaluation;
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
