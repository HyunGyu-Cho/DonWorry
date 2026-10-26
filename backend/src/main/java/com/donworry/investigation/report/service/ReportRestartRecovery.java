package com.donworry.investigation.report.service;

import com.donworry.investigation.service.CaseStatusService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

// Spring이 다시 켜지면 조사 중으로 남은 보고서를 실패로 닫는다 (2-18, 10/26 결정 (가))
// 몇 번째 시도인지는 메모리에만 있어 이어갈 수 없다 — 나중에 "다시 요청하기"로 바꾸려면 close만 고친다
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportRestartRecovery {

    private final ReportTransitions reportTransitions;
    private final ReportService reportService;
    private final CaseStatusService caseStatusService;

    @EventListener(ApplicationReadyEvent.class)
    public void closeUnfinished() {
        for (ReportTarget target : reportTransitions.unfinished()) {
            close(target);
        }
    }

    private void close(ReportTarget target) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Map<String, Object> error = Map.of(
                "error",
                Map.of("code", "SERVER_RESTARTED", "reason", "조사 중 서버가 다시 켜짐", "lastAttemptAt", now.toString()));
        if (reportTransitions.fail(target.reportId(), error, now)) {
            log.warn("재시작으로 조사 중이던 보고서를 실패로 닫음 reportId={} caseId={}", target.reportId(), target.caseId());
            reportService.afterFinished(target);
            caseStatusService.refreshById(target.caseId());
        }
    }
}
