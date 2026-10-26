package com.donworry.investigation.report.service;

import com.donworry.investigation.report.dto.InvestigationResultRequest;
import com.donworry.investigation.service.CaseStatusService;
import com.donworry.investigation.service.PaymentInfoReader;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
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
    private final PaymentInfoReader paymentInfoReader;
    // 증거 조회 기록을 보고서 trace에 넣는다 (2-19)
    private final ReportToolService reportToolService;
    // 다시 요청은 쉬는 시간이 있어 결과를 보낸 ai-server를 기다리게 하지 않도록 따로 돌린다
    private final Executor retryExecutor;

    @Autowired
    ReportResultService(
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            AiServerReportWriter aiServerReportWriter,
            ReportService reportService,
            CaseStatusService caseStatusService,
            PaymentInfoReader paymentInfoReader,
            ReportToolService reportToolService) {
        this(
                reportTransitions,
                attemptRegistry,
                aiServerReportWriter,
                reportService,
                caseStatusService,
                paymentInfoReader,
                reportToolService,
                Executors.newVirtualThreadPerTaskExecutor());
    }

    ReportResultService(
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            AiServerReportWriter aiServerReportWriter,
            ReportService reportService,
            CaseStatusService caseStatusService,
            PaymentInfoReader paymentInfoReader,
            ReportToolService reportToolService,
            Executor retryExecutor) {
        this.reportTransitions = reportTransitions;
        this.attemptRegistry = attemptRegistry;
        this.aiServerReportWriter = aiServerReportWriter;
        this.reportService = reportService;
        this.caseStatusService = caseStatusService;
        this.paymentInfoReader = paymentInfoReader;
        this.reportToolService = reportToolService;
        this.retryExecutor = retryExecutor;
    }

    public void receive(Long reportId, InvestigationResultRequest result) {
        // 옛 시도 · 재시작 전 시도의 늦은 결과는 성공이든 실패든 무시한다 (이미 실패 1회로 셌거나 버린 시도)
        if (!attemptRegistry.isCurrent(reportId, result.attemptId())) {
            log.info("현재 시도가 아닌 결과는 무시 reportId={} attemptId={}", reportId, result.attemptId());
            return;
        }
        Optional<ReportTarget> found = reportTransitions.target(reportId);
        // 그사이 대체됨 · 실패로 끝났으면 할 일이 없다 (2-18)
        if (found.isEmpty() || reportTransitions.isFinished(reportId)) {
            attemptRegistry.forget(reportId);
            return;
        }
        ReportTarget target = found.get();
        Map<Long, PaymentInfo> payments = payments(target.caseId());
        Optional<String> problem = result.isSucceeded()
                ? ReportDraftCheck.problem(target, result.report(), payments.keySet())
                : Optional.of(failureReason(result));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (problem.isEmpty()) {
            Map<String, Object> body = ConclusionReportBuilder.build(
                    target,
                    result.report(),
                    result.steps(),
                    reportToolService.traceRows(reportId, result.attemptId()),
                    payments,
                    now);
            // 이미 끝난 보고서면 false — 덮지 않고 할 일도 없다 (#54)
            if (reportTransitions.succeed(reportId, body, now)) {
                finish(target);
            }
            return;
        }
        failAttempt(target, result.isSucceeded() ? "AI_RESULT_INVALID" : "AI_RESULT_FAILED", problem.get(), now);
    }

    // 결과가 제때 오지 않았고 ai-server에 물어도 끝난 결과가 없을 때 — 시도 1번 실패로 센다 (2-18)
    public void timedOut(Long reportId, UUID attemptId) {
        if (!attemptRegistry.isCurrent(reportId, attemptId)) {
            return;
        }
        Optional<ReportTarget> found = reportTransitions.target(reportId);
        if (found.isEmpty() || reportTransitions.isFinished(reportId)) {
            attemptRegistry.forget(reportId);
            return;
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        failAttempt(found.get(), "AI_RESULT_TIMEOUT", "결과가 제시간에 오지 않음", now);
    }

    // 시도 1번 실패 — 총 3번 전이면 새 시도로 다시 요청, 3번째면 FAILED로 끝낸다
    private void failAttempt(ReportTarget target, String code, String reason, Instant now) {
        Long reportId = target.reportId();
        int attempts = attemptRegistry.attempts(reportId);
        log.warn("조사 결과 실패 reportId={} attempt={} code={} reason={}", reportId, attempts, code, reason);
        if (attempts < AiServerReportWriter.MAX_ATTEMPTS) {
            retryExecutor.execute(() -> retry(target));
            return;
        }
        if (reportTransitions.fail(reportId, error(code, reason, attempts, now), now)) {
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
        Map<Long, PaymentInfo> payments = new LinkedHashMap<>();
        for (Long id : reportTransitions.casePaymentIds(caseId)) {
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
    private static Map<String, Object> error(String code, String reason, int attempts, Instant now) {
        return Map.of(
                "error", Map.of("code", code, "reason", reason, "attempts", attempts, "lastAttemptAt", now.toString()));
    }
}
