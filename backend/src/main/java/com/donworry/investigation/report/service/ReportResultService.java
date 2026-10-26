package com.donworry.investigation.report.service;

import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.report.dto.InvestigationResultRequest;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.service.CaseStatusService;
import com.donworry.investigation.service.PaymentInfoReader;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

// ai-server가 보낸 조사 결과를 받는다 (ADR-0009 결정 1 · 2 · 4)
// 현재 시도의 결과만 반영하고, 검사를 통과하면 결론 카드로 합쳐 완료 — 아니면 시도 1회 실패로 세고 다시 요청
@Slf4j
@Service
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "ai-server")
public class ReportResultService {

    private final ReportTransitions reportTransitions;
    private final AttemptRegistry attemptRegistry;
    private final AiServerReportWriter aiServerReportWriter;
    private final ReportService reportService;
    private final CaseStatusService caseStatusService;
    private final CasePaymentRepository casePaymentRepository;
    private final PaymentInfoReader paymentInfoReader;
    // 다시 요청은 쉬는 시간이 있어 결과를 보낸 ai-server를 기다리게 하지 않도록 따로 돌린다
    private final Executor retryExecutor;

    @Autowired
    ReportResultService(
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            AiServerReportWriter aiServerReportWriter,
            ReportService reportService,
            CaseStatusService caseStatusService,
            CasePaymentRepository casePaymentRepository,
            PaymentInfoReader paymentInfoReader) {
        this(
                reportTransitions,
                attemptRegistry,
                aiServerReportWriter,
                reportService,
                caseStatusService,
                casePaymentRepository,
                paymentInfoReader,
                Executors.newVirtualThreadPerTaskExecutor());
    }

    ReportResultService(
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            AiServerReportWriter aiServerReportWriter,
            ReportService reportService,
            CaseStatusService caseStatusService,
            CasePaymentRepository casePaymentRepository,
            PaymentInfoReader paymentInfoReader,
            Executor retryExecutor) {
        this.reportTransitions = reportTransitions;
        this.attemptRegistry = attemptRegistry;
        this.aiServerReportWriter = aiServerReportWriter;
        this.reportService = reportService;
        this.caseStatusService = caseStatusService;
        this.casePaymentRepository = casePaymentRepository;
        this.paymentInfoReader = paymentInfoReader;
        this.retryExecutor = retryExecutor;
    }

    public void receive(Long reportId, InvestigationResultRequest result) {
        // 옛 시도 · 재시작 전 시도의 늦은 결과는 성공이든 실패든 무시한다 (이미 실패 1회로 셌거나 버린 시도)
        if (!attemptRegistry.isCurrent(reportId, result.attemptId())) {
            log.info("현재 시도가 아닌 결과는 무시 reportId={} attemptId={}", reportId, result.attemptId());
            return;
        }
        Optional<ReportTarget> found = reportTransitions.target(reportId);
        if (found.isEmpty()) {
            return;
        }
        ReportTarget target = found.get();
        Map<Long, PaymentInfo> payments = payments(target.caseId());
        Optional<String> problem = result.isSucceeded()
                ? ReportDraftCheck.problem(target, result.report(), payments.keySet())
                : Optional.of(failureReason(result));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (problem.isEmpty()) {
            Map<String, Object> body =
                    ConclusionReportBuilder.build(target, result.report(), result.steps(), payments, now);
            // 이미 끝난 보고서면 false — 덮지 않고 할 일도 없다 (#54)
            if (reportTransitions.succeed(reportId, body, now)) {
                finish(target);
            }
            return;
        }
        int attempts = attemptRegistry.attempts(reportId);
        log.warn("조사 결과 실패 reportId={} attempt={} reason={}", reportId, attempts, problem.get());
        if (attempts < AiServerReportWriter.MAX_ATTEMPTS) {
            retryExecutor.execute(() -> retry(target));
            return;
        }
        if (reportTransitions.fail(reportId, error(result, problem.get(), attempts, now), now)) {
            finish(target);
        }
    }

    // 새 시도 번호로 다시 요청한다. 접수까지 안 되면 작성기가 실패로 끝내므로 그때 마무리한다
    private void retry(ReportTarget target) {
        aiServerReportWriter.write(target);
        if (reportTransitions.isFinished(target.reportId())) {
            finish(target);
        }
    }

    // 끝난 보고서 마무리 — 시도 기록을 지우고, 그사이 증거가 바뀌었으면 다음 버전, 사건 상태 갱신
    // 사건 상태는 같은 모듈의 P3 기능을 바로 부른다 (완료 통지 방식은 P3와 합의 전, ADR-0009 §5.3)
    private void finish(ReportTarget target) {
        attemptRegistry.forget(target.reportId());
        reportService.afterFinished(target);
        caseStatusService.refreshById(target.caseId());
    }

    private Map<Long, PaymentInfo> payments(Long caseId) {
        Set<Long> ids = casePaymentRepository.findBySecurityCaseIdOrderByLinkedAtAsc(caseId).stream()
                .map(CasePayment::getPaymentId)
                .collect(Collectors.toSet());
        Map<Long, PaymentInfo> payments = new LinkedHashMap<>();
        for (Long id : ids) {
            // 결제 정보를 못 찾아도 사건 소속 번호로는 인정한다 — 금액만 비운다
            payments.put(id, paymentInfoReader.find(id).orElse(null));
        }
        return payments;
    }

    private static String failureReason(InvestigationResultRequest result) {
        Object reason = result.error() != null ? result.error().get("reason") : null;
        return "ai-server 조사 실패: " + (reason != null ? reason : "이유 없음");
    }

    // 개발자 조사용 실패 정보 — P3 · 화면에는 넘기지 않는다 (ReportService.snapshot)
    private static Map<String, Object> error(
            InvestigationResultRequest result, String reason, int attempts, Instant now) {
        String code = result.isSucceeded() ? "AI_RESULT_INVALID" : "AI_RESULT_FAILED";
        return Map.of(
                "error", Map.of("code", code, "reason", reason, "attempts", attempts, "lastAttemptAt", now.toString()));
    }
}
