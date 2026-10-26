package com.donworry.investigation.report.service;

import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.PaymentInfoReader;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// 2-16(ai-server 호출) 전까지 쓰는 임시 작성기 — 틀에 맞춘 문장으로 보고서를 그 자리에서 완료한다
// 옛 P3 MockReportGateway의 본문 만들기를 옮겼다. 화면 ReportBody(fds 정본 02 §2.7) 키를 따른다
// P3 테이블(security_cases · case_payments)은 읽기만 한다. 설정 donworry.report.writer=fake (기본값)
@Component
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "fake", matchIfMissing = true)
@RequiredArgsConstructor
class FakeReportWriter implements ReportWriter {

    private final SecurityCaseRepository securityCaseRepository;
    private final CasePaymentRepository casePaymentRepository;
    private final PaymentInfoReader paymentInfoReader;
    private final ReportTransitions reportTransitions;

    @Override
    public void write(ReportTarget target) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Optional<SecurityCase> securityCase = securityCaseRepository.findById(target.caseId());
        List<Optional<PaymentInfo>> found =
                casePaymentRepository.findBySecurityCaseIdOrderByLinkedAtAsc(target.caseId()).stream()
                        .map(CasePayment::getPaymentId)
                        .map(paymentInfoReader::find)
                        .toList();
        List<PaymentInfo> payments = found.stream().flatMap(Optional::stream).toList();
        // 연결된 결제 중 하나라도 조회하지 못하면(예: 서버 재시작으로 목 결제 정보가 비었을 때) 성공 보고서를 만들지 않는다
        // 증거가 빠진 보고서를 판정 근거로 쓰지 않도록 FAILED로 남긴다 — 직원은 수동 판정 경로로 간다 (fds 정본 02 §2.5)
        if (securityCase.isEmpty() || payments.size() != found.size()) {
            reportTransitions.fail(target.reportId(), error(now), now);
            return;
        }
        reportTransitions.succeed(
                target.reportId(),
                body(securityCase.get(), payments, target.reportVersion(), target.evidenceVersion(), now),
                now);
    }

    // 개발자 조사용 실패 정보 — ReportService가 P3 · 화면에는 넘기지 않는다
    private static Map<String, Object> error(Instant now) {
        return Map.of(
                "error",
                Map.of(
                        "code",
                        "PAYMENT_INFO_MISSING",
                        "reason",
                        "연결된 결제 정보를 찾지 못함",
                        "attempts",
                        1,
                        "lastAttemptAt",
                        now.toString()));
    }

    private static Map<String, Object> body(
            SecurityCase securityCase,
            List<PaymentInfo> payments,
            int reportVersion,
            int evidenceVersion,
            Instant now) {
        long totalAmount = payments.stream().mapToLong(PaymentInfo::amount).sum();
        String dataVersion = "evidence v" + evidenceVersion;
        List<Map<String, Object>> analyses = new ArrayList<>();
        List<Map<String, Object>> timeline = new ArrayList<>();
        for (PaymentInfo payment : payments) {
            analyses.add(Map.of(
                    "paymentId", payment.paymentId(),
                    "amount", payment.amount(),
                    "requestedAt", payment.requestedAt().toString(),
                    "riskScore", payment.riskScore(),
                    "ruleHits", payment.ruleHits(),
                    "riskEvidence",
                            payment.ruleHits().stream()
                                    .map(rule -> rule + " 규칙 적중")
                                    .toList(),
                    "normalEvidence", List.of("기존 배송지와 일치"),
                    "unknowns", List.of("고객 본인의 결제 의사"),
                    "recommendation", "NEEDS_CHECK"));
            timeline.add(Map.of(
                    "at",
                    payment.requestedAt().toString(),
                    "event",
                    payment.paymentId() + " 결제 요청 · FDS REVIEW (" + payment.riskScore() + "점)"));
        }
        return Map.of(
                "overview",
                Map.of(
                        "caseId", securityCase.getId(),
                        "merchantId", securityCase.getMerchantId(),
                        "customerRef", securityCase.getCustomerRef(),
                        "paymentCount", payments.size(),
                        "totalAmount", totalAmount,
                        "caseCreatedAt", securityCase.getCreatedAt().toString(),
                        "investigatedAt", now.toString(),
                        "reportVersion", reportVersion),
                "summary",
                List.of(
                        "조사 대상 결제 " + payments.size() + "건에서 FDS 규칙 적중이 확인되었습니다.",
                        "직원은 결제별 위험 근거와 정상 정황을 비교한 뒤 판정해 주세요."),
                "paymentAnalyses",
                analyses,
                "timeline",
                timeline,
                "overallAnalysis",
                List.of("결제 간 공통 기기·계정 관계는 확인되지 않았습니다."),
                "additionalChecks",
                List.of("고객 본인 확인 필요 여부"),
                "recommendation",
                Map.of(
                        "summary",
                        "추가 확인 후 결제별로 판정할 것을 권고합니다.",
                        "limitations",
                        List.of("목업 보고서입니다. FDS 점수는 부정거래 확률이 아닙니다.")),
                "evidence",
                List.of(
                        evidence(
                                "get_case_payments", "P3·P5", securityCase.getId(), reportVersion, 1, now, dataVersion),
                        evidence("get_fds_evidence", "P2", securityCase.getId(), reportVersion, 2, now, dataVersion)));
    }

    private static Map<String, Object> evidence(
            String toolName, String source, Long caseId, int reportVersion, int seq, Instant now, String dataVersion) {
        return Map.of(
                "toolName", toolName,
                "source", source,
                "evidenceId", "E-" + caseId + "-v" + reportVersion + "-0" + seq,
                "retrievedAt", now.toString(),
                "dataVersion", dataVersion);
    }
}
