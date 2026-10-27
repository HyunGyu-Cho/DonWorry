package com.donworry.fds.service;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsEvaluationResponse;
import com.donworry.fds.api.FdsEvaluator;
import com.donworry.fds.entity.FdsEvaluation;
import com.donworry.fds.repository.FdsEvaluationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class FdsEvaluationService implements FdsEvaluator {

    // 룰 계산 실패 오류 코드 — 결제는 매입 보류 → 직원 확인 (#96 F-2)
    static final String RULE_EVALUATION_FAILED = "FDS_RULE_EVALUATION_FAILED";

    private final FdsEvaluationRepository evaluationRepository;
    private final FdsEvaluationTransactionService transactionService;

    public FdsEvaluationService(
            FdsEvaluationRepository evaluationRepository, FdsEvaluationTransactionService transactionService) {
        this.evaluationRepository = evaluationRepository;
        this.transactionService = transactionService;
    }

    @Override
    public FdsEvaluationResponse evaluate(FdsEvaluationRequest request) {
        try {
            return transactionService.evaluate(request);
        } catch (DataIntegrityViolationException exception) {
            return evaluationRepository
                    .findByEvaluationRequestId(request.evaluationRequestId())
                    .map(this::responseOf)
                    .orElseThrow(() -> exception);
        } catch (RuntimeException exception) {
            // 룰 계산이 실패해도 예외로 결제를 멈추지 않는다 — ERROR 평가를 남기고 P5가 매입 보류 (#96 F-2)
            log.warn(
                    "FDS 룰 계산 실패 paymentId={} requestId={}",
                    request.paymentId(),
                    request.evaluationRequestId(),
                    exception);
            return transactionService.recordError(request, RULE_EVALUATION_FAILED);
        }
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
}
