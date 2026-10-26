package com.donworry.investigation.report.service;

import com.donworry.investigation.report.client.AiServerClient;
import com.donworry.investigation.report.client.AiServerClient.Kind;
import com.donworry.investigation.report.client.AiServerClient.Outcome;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// ai-server에 조사를 맡기는 작성기 (donworry.report.writer=ai-server). 접수되면 "생성 중"까지만 하고, 결과 수신은 2-17
// 접수가 안 되면 첫 시도 포함 총 3번까지 다시 해 보고, 끝내 안 되면 "실패" — 직원 수동 판정 경로 (ADR-0009 결정 2)
@Slf4j
@Component
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "ai-server")
class AiServerReportWriter implements ReportWriter {

    static final int MAX_ATTEMPTS = 3;

    // 시도 사이 쉬는 시간 — 1번째 실패 뒤 1초, 2번째 실패 뒤 2초
    static final List<Duration> BACKOFF = List.of(Duration.ofSeconds(1), Duration.ofSeconds(2));

    private final AiServerClient aiServerClient;
    private final ReportTransitions reportTransitions;
    private final AttemptRegistry attemptRegistry;
    private final ReportStepRecorder reportStepRecorder;
    private final Pause pause;

    @Autowired
    AiServerReportWriter(
            AiServerClient aiServerClient,
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            ReportStepRecorder reportStepRecorder) {
        this(
                aiServerClient,
                reportTransitions,
                attemptRegistry,
                reportStepRecorder,
                duration -> Thread.sleep(duration));
    }

    // 테스트는 실제로 기다리지 않도록 쉬는 방법을 바꿔 끼운다
    AiServerReportWriter(
            AiServerClient aiServerClient,
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            ReportStepRecorder reportStepRecorder,
            Pause pause) {
        this.aiServerClient = aiServerClient;
        this.reportTransitions = reportTransitions;
        this.attemptRegistry = attemptRegistry;
        this.reportStepRecorder = reportStepRecorder;
        this.pause = pause;
    }

    // 지금까지 시도한 횟수에 이어서 센다 — 결과 실패 뒤 다시 부르면 2번째 · 3번째 시도가 된다 (#64)
    @Override
    public void write(ReportTarget target) {
        Long reportId = target.reportId();
        Outcome last = null;
        List<Long> paymentIds = reportTransitions.casePaymentIds(target.caseId());
        while (attemptRegistry.attempts(reportId) < MAX_ATTEMPTS) {
            // 쉬는 사이 새 정보로 대체됐으면 더 요청하지 않는다 (2-18)
            if (reportTransitions.isFinished(reportId)) {
                attemptRegistry.forget(reportId);
                return;
            }
            UUID attemptId = attemptRegistry.next(reportId);
            int attempt = attemptRegistry.attempts(reportId);
            Instant sentAt = Instant.now();
            long clock = System.nanoTime();
            last = aiServerClient.requestInvestigation(
                    reportId, attemptId, target.caseId(), target.caseType(), target.evidenceVersion(), paymentIds);
            if (last.kind() == Kind.ACCEPTED) {
                // 조사 과정 첫 단계 — 화면이 조사 중에 바로 보여 준다 (2-19b)
                String summary = attempt == 1 ? "ai-server가 조사를 접수함" : "ai-server가 조사를 접수함 (" + attempt + "번째 시도)";
                int durationMs = (int) ((System.nanoTime() - clock) / 1_000_000);
                reportStepRecorder.step(
                        reportId, attemptId, ReportStepRecorder.REQUEST, true, summary, sentAt, durationMs);
                // 결과가 접수 응답보다 먼저 와서 이미 끝났으면 false — 덮지 않는다 (#54)
                reportTransitions.running(reportId);
                return;
            }
            log.warn("ai-server 접수 실패 reportId={} attempt={} reason={}", reportId, attempt, last.reason());
            if (last.kind() == Kind.REJECTED || attempt == MAX_ATTEMPTS) {
                break;
            }
            if (!rest(BACKOFF.get(attempt - 1))) {
                break;
            }
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        reportTransitions.fail(reportId, error(last, attemptRegistry.attempts(reportId), now), now);
        attemptRegistry.forget(reportId);
    }

    // 쉬는 중에 서버가 내려가면 더 시도하지 않는다
    private boolean rest(Duration duration) {
        try {
            pause.sleep(duration);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    // 개발자 조사용 실패 정보 — P3 · 화면에는 넘기지 않는다 (ReportService.snapshot)
    private static Map<String, Object> error(Outcome last, int attempts, Instant now) {
        String code = last != null && last.kind() == Kind.REJECTED ? "AI_SERVER_REJECTED" : "AI_SERVER_UNREACHABLE";
        String reason = last != null && last.reason() != null ? last.reason() : "ai-server 호출 중단";
        return Map.of(
                "error", Map.of("code", code, "reason", reason, "attempts", attempts, "lastAttemptAt", now.toString()));
    }

    @FunctionalInterface
    interface Pause {
        void sleep(Duration duration) throws InterruptedException;
    }
}
