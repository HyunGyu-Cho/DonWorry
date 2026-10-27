package com.donworry.investigation.report.service;

import com.donworry.investigation.service.CaseStatusService;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

// 직원 [AI 조사 다시 하기] (2-19e) — 실패한 사건을 같은 증거로 새 보고서 버전에서 다시 조사한다
// ReportService는 P3 CaseStatusService가 쓰는 경계라, 사건 상태 갱신까지 하는 이 일은 따로 둔다 (순환 방지)
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportRetryService {

    private final ReportTransitions reportTransitions;
    private final ReportStepRecorder reportStepRecorder;
    private final ReportWriter reportWriter;
    private final ReportService reportService;
    private final CaseStatusService caseStatusService;

    public void retry(Long caseId) {
        Instant now = Instant.now();
        ReportTarget target;
        try {
            target = reportTransitions.reserveRetry(caseId, now);
        } catch (DataIntegrityViolationException e) {
            // 같은 순간 다른 직원이 먼저 다시 하기를 눌렀다 — 그 조사에 합류한 것으로 본다
            log.info("다시 하기 겹침, 진행 중 보고서에 합류 caseId={}", caseId);
            return;
        }
        // 과정 첫 줄 — ai-server 시도가 아니라서 시도 번호는 새로 만든다
        String summary = "v" + (target.reportVersion() - 1) + " 조사가 실패해 직원이 다시 요청함";
        reportStepRecorder.step(target.reportId(), UUID.randomUUID(), ReportStepRecorder.RETRY, true, summary, now, 0);
        caseStatusService.refreshById(caseId);
        reportWriter.write(target);
        reportService.afterFinished(target);
        caseStatusService.refreshById(caseId);
    }
}
