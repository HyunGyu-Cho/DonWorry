package com.donworry.investigation.report.service;

import static com.donworry.investigation.report.entity.ReportStatus.PENDING;
import static com.donworry.investigation.report.entity.ReportStatus.RUNNING;

import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.repository.AiReportRepository;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// ai_reports를 바꾸는 트랜잭션 모음. P3 커밋 뒤 리스너에서도 불리므로 늘 새 트랜잭션을 연다
// security_cases · case_payments는 읽기만 한다 (P3 소유, ADR-0009)
@Service
@RequiredArgsConstructor
public class ReportTransitions {

    private final AiReportRepository aiReportRepository;
    private final SecurityCaseRepository securityCaseRepository;
    private final CasePaymentRepository casePaymentRepository;
    private final AttemptRegistry attemptRegistry;

    // 조사할 행을 PENDING으로 잡는다. 이미 이 증거 버전 이상을 조사했으면 빈 값 (ADR-0009 결정 3)
    // 같은 버전 번호를 동시에 잡으면 UNIQUE 위반이 그대로 나간다 — 부르는 쪽이 합류로 처리한다
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<ReportTarget> reserve(Long caseId, int evidenceVersion, Instant now) {
        Optional<SecurityCase> securityCase = securityCaseRepository.findById(caseId);
        // Case가 없거나 증거 버전이 이미 앞섰으면 낡은 요청 — 새 버전 요청이 만든다
        if (securityCase.isEmpty() || securityCase.get().getEvidenceVersion() != evidenceVersion) {
            return Optional.empty();
        }
        if (aiReportRepository.existsByCaseIdAndEvidenceVersionGreaterThanEqual(caseId, evidenceVersion)) {
            return Optional.empty();
        }
        // 낡은 증거로 조사 중이면 그 조사는 대체됨으로 닫고 바로 새 버전을 잡는다 (2-18, ADR-0009 결정 3 개정)
        // 시도 기록도 지워서 늦게 온 결과는 "현재 시도 아님"으로 무시된다
        for (AiReport running : aiReportRepository.findByCaseIdAndStatusIn(caseId, EnumSet.of(PENDING, RUNNING))) {
            aiReportRepository.markSuperseded(running.getId(), micros(now));
            attemptRegistry.forget(running.getId());
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

    // 결과를 받았을 때 그 보고서의 대상 (Case 종류 포함)
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<ReportTarget> target(Long reportId) {
        return aiReportRepository
                .findById(reportId)
                .flatMap(report -> securityCaseRepository
                        .findById(report.getCaseId())
                        .map(securityCase -> new ReportTarget(
                                report.getId(),
                                report.getCaseId(),
                                securityCase.getCaseType().name(),
                                report.getReportVersion(),
                                report.getEvidenceVersion())));
    }

    // 아직 끝나지 않은 보고서 전체 — Spring이 다시 켜질 때 남아 있던 조사 (2-18)
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public List<ReportTarget> unfinished() {
        return aiReportRepository.findByStatusIn(EnumSet.of(PENDING, RUNNING)).stream()
                .map(report -> target(report.getId()))
                .flatMap(Optional::stream)
                .toList();
    }

    // 끝난 보고서인지 — 없는 보고서도 끝난 것으로 본다 (더 할 일이 없음)
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public boolean isFinished(Long reportId) {
        return aiReportRepository
                .findById(reportId)
                .map(report -> report.getStatus().isFinished())
                .orElse(true);
    }

    // 사건에 묶인 결제 번호 (묶인 순서) — ai-server 요청과 결과 검사가 같은 목록을 쓴다
    // AI는 이 목록 밖의 결제를 권고할 수 없다 (2-17, 자세한 증거는 2-19 Tool)
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public List<Long> casePaymentIds(Long caseId) {
        return casePaymentRepository.findBySecurityCaseIdOrderByLinkedAtAsc(caseId).stream()
                .map(CasePayment::getPaymentId)
                .distinct()
                .toList();
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
