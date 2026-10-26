package com.donworry.investigation.report.service;

import com.donworry.investigation.report.dto.InvestigationResultRequest;
import com.donworry.investigation.report.dto.StepReportRequest;
import com.donworry.investigation.service.CaseStatusService;
import com.donworry.investigation.service.PaymentInfoReader;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
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
    // 조사 과정 기록 — 단계 알림을 저장하고 보고서 trace로 쓴다 (2-19 · 2-19b)
    private final ReportStepRecorder reportStepRecorder;
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
            ReportStepRecorder reportStepRecorder) {
        this(
                reportTransitions,
                attemptRegistry,
                aiServerReportWriter,
                reportService,
                caseStatusService,
                paymentInfoReader,
                reportStepRecorder,
                Executors.newVirtualThreadPerTaskExecutor());
    }

    ReportResultService(
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            AiServerReportWriter aiServerReportWriter,
            ReportService reportService,
            CaseStatusService caseStatusService,
            PaymentInfoReader paymentInfoReader,
            ReportStepRecorder reportStepRecorder,
            Executor retryExecutor) {
        this.reportTransitions = reportTransitions;
        this.attemptRegistry = attemptRegistry;
        this.aiServerReportWriter = aiServerReportWriter;
        this.reportService = reportService;
        this.caseStatusService = caseStatusService;
        this.paymentInfoReader = paymentInfoReader;
        this.reportStepRecorder = reportStepRecorder;
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
            reportStepRecorder.step(reportId, result.attemptId(), ReportStepRecorder.SAVE, true, "결론 카드로 저장", now, 0);
            // 과정 = 지금까지의 기록 전체 (2-19b). ai-server가 단계를 하나도 못 알렸으면 결과에 실려 온 steps로 채운다
            List<Map<String, Object>> aiServerSteps =
                    reportStepRecorder.hasAiServerSteps(reportId) ? null : result.steps();
            Map<String, Object> body = ConclusionReportBuilder.build(
                    target, result.report(), aiServerSteps, reportStepRecorder.rows(reportId), payments, now);
            // 이미 끝난 보고서면 false — 덮지 않고 할 일도 없다 (#54)
            if (reportTransitions.succeed(reportId, body, now)) {
                finish(target);
            }
            return;
        }
        failAttempt(target, result.isSucceeded() ? "AI_RESULT_INVALID" : "AI_RESULT_FAILED", problem.get(), now);
    }

    // ai-server가 AI 판단 · 형식 검사 한 번을 끝낼 때마다 알린다 (2-19b) — 현재 시도만 기록, 아니면 409
    public void recordStep(Long reportId, StepReportRequest step) {
        if (!attemptRegistry.isCurrent(reportId, step.attemptId()) || reportTransitions.isFinished(reportId)) {
            throw new ReportException(ReportErrorCode.NOT_CURRENT_ATTEMPT);
        }
        boolean ok = Boolean.TRUE.equals(step.ok());
        boolean validation = "VALIDATION".equals(step.kind());
        String kind = validation
                ? (ok ? ReportStepRecorder.VALIDATE : ReportStepRecorder.LLM_FAILED)
                : ReportStepRecorder.LLM;
        String detail = step.detail() == null || step.detail().isBlank() ? kind : step.detail();
        Instant startedAt = step.startedAt() != null ? step.startedAt().toInstant() : Instant.now();
        int durationMs = step.durationMs() != null ? Math.max(step.durationMs(), 0) : 0;
        reportStepRecorder.step(reportId, step.attemptId(), kind, ok, detail, startedAt, durationMs);
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
