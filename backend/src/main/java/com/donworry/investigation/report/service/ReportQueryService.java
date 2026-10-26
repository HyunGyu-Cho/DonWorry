package com.donworry.investigation.report.service;

import com.donworry.investigation.report.dto.ReportRunResponse;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import com.donworry.investigation.report.repository.AiReportRepository;
import java.util.Comparator;
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
        return new ReportRunResponse(
                String.valueOf(caseId),
                latest.getReportVersion(),
                runStatus(latest.getStatus()),
                latest.getCreatedAt(),
                latest.getCompletedAt(),
                List.of(),
                null);
    }

    private List<AiReport> reports(Long caseId) {
        return aiReportRepository.findByCaseIdOrderByReportVersionAsc(caseId);
    }

    // 생성 대기는 ai-server 접수 직전이라 화면에는 조사 중으로 보인다
    private static String runStatus(ReportStatus status) {
        return status == ReportStatus.PENDING ? ReportStatus.RUNNING.name() : status.name();
    }
}
