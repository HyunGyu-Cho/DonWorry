package com.donworry.investigation.report.service;

import com.donworry.investigation.report.dto.ReportRunResponse;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import com.donworry.investigation.report.repository.AiReportRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 화면이 읽는 보고서 조회 (2-17b) — ai_reports는 읽기만 한다
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportQueryService {

    private final AiReportRepository aiReportRepository;
    private final ReportStepRecorder reportStepRecorder;

    // 완료된 보고서 중 버전이 가장 높은 것의 본문. 최신 조사가 실패했어도 이전 완료본을 보여 준다
    // 본문은 결론 카드(schemaVersion 2) 또는 옛 8개 절 형식 — 화면 asConclusionReport가 바꾼다
    public Map<String, Object> latestCompleted(Long caseId) {
        return reports(caseId).stream()
                .filter(report -> report.getStatus() == ReportStatus.SUCCEEDED)
                .max(Comparator.comparingInt(AiReport::getReportVersion))
                .map(AiReport::getReportBody)
                .orElseThrow(() -> new ReportException(ReportErrorCode.REPORT_NOT_FOUND));
    }

    // 가장 최근 보고서의 조사 상태. 실패 이유(error)는 개발자 조사용이라 넣지 않는다 (ADR-0009 결정 2)
    public ReportRunResponse latestRun(Long caseId) {
        AiReport latest = reports(caseId).stream()
                .max(Comparator.comparingInt(AiReport::getReportVersion))
                .orElseThrow(() -> new ReportException(ReportErrorCode.REPORT_NOT_FOUND));
        // 지금까지 기록된 단계 (모든 시도). 조사 중이면 맨 끝에 "지금 하는 단계"를 붙인다 (2-19b)
        List<Map<String, Object>> steps = new ArrayList<>(reportStepRecorder.rows(latest.getId()));
        Integer currentStepNo = null;
        if (!latest.getStatus().isFinished()) {
            currentStepNo = steps.size() + 1;
            steps.add(runningRow(currentStepNo, runningSince(steps, latest.getCreatedAt())));
        }
        return new ReportRunResponse(
                String.valueOf(caseId),
                latest.getReportVersion(),
                runStatus(latest.getStatus()),
                latest.getCreatedAt(),
                latest.getCompletedAt(),
                steps,
                currentStepNo);
    }

    // 지금 하는 단계는 마지막으로 끝난 단계 뒤에 시작했다 — 화면이 이 시각부터 걸린 시간을 센다
    private static Instant runningSince(List<Map<String, Object>> steps, Instant reportCreatedAt) {
        if (steps.isEmpty()) {
            return reportCreatedAt;
        }
        Map<String, Object> last = steps.getLast();
        Object duration = last.get("durationMs");
        long ms = duration instanceof Number number ? number.longValue() : 0;
        return Instant.parse(String.valueOf(last.get("startedAt"))).plusMillis(ms);
    }

    // 아직 끝나지 않은 단계
    private static Map<String, Object> runningRow(int stepNo, Instant startedAt) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("stepNo", stepNo);
        row.put("kind", ReportStepRecorder.LLM);
        row.put("label", "AI가 조사하는 중…");
        row.put("toolName", null);
        row.put("startedAt", startedAt.toString());
        row.put("durationMs", null);
        row.put("asked", "다음 증거를 고르거나 보고서를 쓰는 중");
        row.put("got", null);
        row.put("status", "RUNNING");
        return row;
    }

    private List<AiReport> reports(Long caseId) {
        return aiReportRepository.findByCaseIdOrderByReportVersionAsc(caseId);
    }

    // 생성 대기는 ai-server 접수 직전이라 화면에는 조사 중으로 보인다
    private static String runStatus(ReportStatus status) {
        return status == ReportStatus.PENDING ? ReportStatus.RUNNING.name() : status.name();
    }
}
