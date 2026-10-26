package com.donworry.investigation.report.service;

import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import com.donworry.investigation.report.repository.AiReportRepository;
import com.donworry.investigation.service.ReportGateway;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

// P3 → P4 보고서 경계의 실제 구현 — ai_reports에 버전별로 쌓는다 (ADR-0009 결정 2 · 3)
// 내용은 ReportWriter가 채운다. P3는 이 인터페이스로만 보고서를 요청 · 조회한다
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService implements ReportGateway {

    private final ReportTransitions reportTransitions;
    private final AiReportRepository aiReportRepository;
    private final ReportWriter reportWriter;

    // P3가 커밋한 뒤에 부른다. 만들 필요가 없으면 조용히 끝난다
    @Override
    public void request(Long caseId, int evidenceVersion) {
        Optional<ReportTarget> target;
        try {
            target = reportTransitions.reserve(caseId, evidenceVersion, Instant.now());
        } catch (DataIntegrityViolationException e) {
            // 동시 요청이 같은 버전 번호를 먼저 잡았다 — 그 작업에 합류한 것으로 본다 (ADR-0009 결정 3)
            log.info("보고서 버전 겹침, 진행 중 보고서에 합류 caseId={}", caseId);
            return;
        }
        target.ifPresent(reserved -> {
            reportWriter.write(reserved);
            afterFinished(reserved);
        });
    }

    // 보고서가 끝난 뒤, 그사이 Case 증거가 바뀌었으면 다음 버전을 요청한다 (ADR-0009 결정 3 "완료 후 비교")
    // 아직 끝나지 않았으면 다음 요청은 "진행 중 있음"으로 건너뛴다. 비동기 작성기(2-16)는 결과 수신(2-17)에서 다시 부른다
    public void afterFinished(ReportTarget target) {
        reportTransitions
                .currentEvidenceVersion(target.caseId())
                .filter(current -> current > target.evidenceVersion())
                .ifPresent(current -> request(target.caseId(), current));
    }

    @Override
    public List<ReportSnapshot> findByCase(Long caseId) {
        return aiReportRepository.findByCaseIdOrderByReportVersionAsc(caseId).stream()
                .map(ReportService::snapshot)
                .toList();
    }

    // 실패 이유(error)는 개발자 조사용이라 P3 · 화면에 넘기지 않는다 (ADR-0009 결정 2)
    private static ReportSnapshot snapshot(AiReport report) {
        boolean failed = report.getStatus() == ReportStatus.FAILED;
        return new ReportSnapshot(
                report.getId(),
                report.getCaseId(),
                report.getReportVersion(),
                report.getEvidenceVersion(),
                report.getStatus().name(),
                failed ? null : report.getReportBody(),
                report.getCreatedAt(),
                report.getCompletedAt());
    }
}
