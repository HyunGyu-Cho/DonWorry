package com.donworry.investigation.report.service;

import static com.donworry.investigation.report.entity.ReportStatus.PENDING;
import static com.donworry.investigation.report.entity.ReportStatus.RUNNING;

import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.repository.AiReportRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// ai_reports를 바꾸는 트랜잭션 모음. P3 커밋 뒤 리스너에서도 불리므로 늘 새 트랜잭션을 연다
// security_cases는 증거 버전을 읽기만 한다 (P3 소유, ADR-0009)
@Service
@RequiredArgsConstructor
public class ReportTransitions {

    private final AiReportRepository aiReportRepository;
    private final SecurityCaseRepository securityCaseRepository;

    // 조사할 행을 PENDING으로 잡는다. 만들지 않아도 되면 빈 값 (ADR-0009 결정 3)
    // 같은 버전 번호를 동시에 잡으면 UNIQUE 위반이 그대로 나간다 — 부르는 쪽이 합류로 처리한다
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<ReportTarget> reserve(Long caseId, int evidenceVersion, Instant now) {
        Optional<SecurityCase> securityCase = securityCaseRepository.findById(caseId);
        // Case가 없거나 증거 버전이 이미 앞섰으면 낡은 요청 — 새 버전 요청이 만든다
        if (securityCase.isEmpty() || securityCase.get().getEvidenceVersion() != evidenceVersion) {
            return Optional.empty();
        }
        if (aiReportRepository.existsByCaseIdAndStatusIn(caseId, EnumSet.of(PENDING, RUNNING))
                || aiReportRepository.existsByCaseIdAndEvidenceVersionGreaterThanEqual(caseId, evidenceVersion)) {
            return Optional.empty();
        }
        int reportVersion = aiReportRepository.findMaxReportVersion(caseId).orElse(0) + 1;
        AiReport saved = aiReportRepository.save(AiReport.pending(caseId, reportVersion, evidenceVersion, now));
        String caseType = securityCase.get().getCaseType().name();
        return Optional.of(new ReportTarget(saved.getId(), caseId, caseType, reportVersion, evidenceVersion));
    }

    // ai-server가 접수(202)했을 때. 결과가 먼저 와서 이미 끝났으면 false (덮지 않음)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean running(Long reportId) {
        return aiReportRepository.markRunning(reportId) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean succeed(Long reportId, Map<String, Object> reportBody, Instant completedAt) {
        return aiReportRepository.markSucceeded(reportId, reportBody, micros(completedAt)) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean fail(Long reportId, Map<String, Object> errorBody, Instant completedAt) {
        return aiReportRepository.markFailed(reportId, errorBody, micros(completedAt)) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<Integer> currentEvidenceVersion(Long caseId) {
        return securityCaseRepository.findById(caseId).map(SecurityCase::getEvidenceVersion);
    }

    // DATETIME(6)에 저장되는 값과 같게 마이크로초로 맞춘다
    private static Instant micros(Instant at) {
        return at.truncatedTo(ChronoUnit.MICROS);
    }
}
