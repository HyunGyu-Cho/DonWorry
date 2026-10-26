package com.donworry.investigation.report.service;

import com.donworry.investigation.report.client.AiServerClient;
import com.donworry.investigation.report.dto.InvestigationResultRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

// 결과가 제때 오지 않는 조사를 찾는다 (2-18, ai-server 방식에서만)
// 시도를 시작한 지 2분이 지나면 ai-server에 직접 묻고 — 끝난 결과면 받은 것처럼, 아니면 시도 1번 실패
@Slf4j
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "ai-server")
public class ReportTimeoutChecker {

    private final AttemptRegistry attemptRegistry;
    private final AiServerClient aiServerClient;
    private final ReportResultService reportResultService;
    private final Duration resultTimeout;

    ReportTimeoutChecker(
            AttemptRegistry attemptRegistry,
            AiServerClient aiServerClient,
            ReportResultService reportResultService,
            @Value("${donworry.report.result-timeout:PT2M}") Duration resultTimeout) {
        this.attemptRegistry = attemptRegistry;
        this.aiServerClient = aiServerClient;
        this.reportResultService = reportResultService;
        this.resultTimeout = resultTimeout;
    }

    @Scheduled(
            fixedDelayString = "${donworry.report.timeout-check-interval:PT15S}",
            initialDelayString = "${donworry.report.timeout-check-interval:PT15S}")
    void checkOverdue() {
        checkOverdue(Instant.now());
    }

    void checkOverdue(Instant now) {
        for (Map.Entry<Long, UUID> overdue :
                attemptRegistry.startedBefore(now.minus(resultTimeout)).entrySet()) {
            check(overdue.getKey(), overdue.getValue());
        }
    }

    // 늦은 시도 하나 — 테스트는 이 시도만 골라 바로 부른다
    void check(Long reportId, UUID attemptId) {
        Optional<InvestigationResultRequest> result = aiServerClient.findResult(reportId, attemptId);
        if (result.isPresent() && result.get().isFinished()) {
            // 결과 보내기만 실패했던 경우 — 콜백과 같은 길로 반영한다
            log.info("늦은 결과를 직접 가져옴 reportId={} attemptId={}", reportId, attemptId);
            reportResultService.receive(reportId, result.get());
        } else {
            reportResultService.timedOut(reportId, attemptId);
        }
    }
}
