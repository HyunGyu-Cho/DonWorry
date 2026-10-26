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
    private final Pause pause;

    @Autowired
    AiServerReportWriter(
            AiServerClient aiServerClient, ReportTransitions reportTransitions, AttemptRegistry attemptRegistry) {
        this(aiServerClient, reportTransitions, attemptRegistry, duration -> Thread.sleep(duration));
    }

    // 테스트는 실제로 기다리지 않도록 쉬는 방법을 바꿔 끼운다
    AiServerReportWriter(
            AiServerClient aiServerClient,
            ReportTransitions reportTransitions,
            AttemptRegistry attemptRegistry,
            Pause pause) {
        this.aiServerClient = aiServerClient;
        this.reportTransitions = reportTransitions;
        this.attemptRegistry = attemptRegistry;
        this.pause = pause;
    }

    @Override
    public void write(ReportTarget target) {
        Outcome last = null;
        int attempt = 0;
        while (attempt < MAX_ATTEMPTS) {
            attempt++;
            UUID attemptId = attemptRegistry.next(target.reportId());
            last = aiServerClient.requestInvestigation(
                    target.reportId(), attemptId, target.caseId(), target.caseType(), target.evidenceVersion());
            if (last.kind() == Kind.ACCEPTED) {
                // 결과가 접수 응답보다 먼저 와서 이미 끝났으면 false — 덮지 않는다 (#54)
                reportTransitions.running(target.reportId());
                return;
            }
            log.warn("ai-server 접수 실패 reportId={} attempt={} reason={}", target.reportId(), attempt, last.reason());
            if (last.kind() == Kind.REJECTED || attempt == MAX_ATTEMPTS) {
                break;
            }
            if (!rest(BACKOFF.get(attempt - 1))) {
                break;
            }
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        reportTransitions.fail(target.reportId(), error(last, attempt, now), now);
        attemptRegistry.forget(target.reportId());
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
