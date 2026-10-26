package com.donworry.investigation.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import com.donworry.investigation.report.repository.AiReportRepository;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.ReportGateway.ReportSnapshot;
import com.donworry.investigation.service.mock.MockPaymentInfoStore;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

// P4 보고서 경계 실제 구현 — ai_reports에 쌓이고 ADR-0009 결정 3대로 중복을 막는지 실제 MariaDB에서 확인한다
// 보고서 저장이 별도 트랜잭션으로 커밋되므로 롤백 테스트가 아니다. 테스트마다 새 Case를 만든다
@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
class ReportServiceTests {

    @Autowired
    ReportService reportService;

    @Autowired
    AiReportRepository aiReportRepository;

    @Autowired
    SecurityCaseRepository securityCaseRepository;

    @Autowired
    CasePaymentRepository casePaymentRepository;

    @Autowired
    MockPaymentInfoStore mockPaymentInfoStore;

    // 결제 정보가 있는 결제 하나가 묶인 Case (증거 버전 1)
    private SecurityCase caseWithPayment() {
        SecurityCase securityCase = securityCaseRepository.save(
                SecurityCase.open(1L, "customer-" + UUID.randomUUID(), CaseType.PAYMENT_FRAUD, Instant.now()));
        Long paymentId = mockPaymentInfoStore
                .registerHeld(650_000L, 55, List.of("HIGH_AMOUNT", "NEW_CARD"), Instant.now())
                .paymentId();
        casePaymentRepository.save(CasePayment.link(securityCase, paymentId, Instant.now()));
        return securityCase;
    }

    private List<AiReport> reportsOf(Long caseId) {
        return aiReportRepository.findByCaseIdOrderByReportVersionAsc(caseId);
    }

    // 조사 요청 → ai_reports에 v1이 쌓이고 가짜 작성기가 본문을 채워 완료한다
    @Test
    void request_newCase_savesSucceededReport() {
        SecurityCase securityCase = caseWithPayment();

        reportService.request(securityCase.getId(), 1);

        List<AiReport> reports = reportsOf(securityCase.getId());
        assertThat(reports).singleElement().satisfies(report -> {
            assertThat(report.getReportVersion()).isEqualTo(1);
            assertThat(report.getEvidenceVersion()).isEqualTo(1);
            assertThat(report.getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
            assertThat(report.getReportBody()).containsKeys("overview", "summary", "paymentAnalyses", "evidence");
            assertThat(report.getCompletedAt()).isNotNull();
        });
        assertThat(reportService.latest(securityCase.getId()))
                .get()
                .extracting(ReportSnapshot::isSucceeded)
                .isEqualTo(true);
    }

    // 같은 증거 버전을 두 번 요청해도 보고서는 하나다
    @Test
    void request_sameEvidenceVersionTwice_createsOnce() {
        SecurityCase securityCase = caseWithPayment();

        reportService.request(securityCase.getId(), 1);
        reportService.request(securityCase.getId(), 1);

        assertThat(reportsOf(securityCase.getId())).hasSize(1);
    }

    // 같은 Case에 끝나지 않은 보고서가 있으면 새로 만들지 않는다
    @Test
    void request_whilePending_createsNothing() {
        SecurityCase securityCase = caseWithPayment();
        aiReportRepository.save(AiReport.pending(securityCase.getId(), 1, 1, Instant.now()));
        securityCase.increaseEvidenceVersion();
        securityCaseRepository.save(securityCase);

        reportService.request(securityCase.getId(), 2);

        assertThat(reportsOf(securityCase.getId()))
                .singleElement()
                .extracting(AiReport::getStatus)
                .isEqualTo(ReportStatus.PENDING);
    }

    // 결제 정보를 못 찾으면 FAILED로 남기고, DB에는 실패 이유가 있지만 P3에는 본문을 넘기지 않는다
    @Test
    void request_paymentInfoMissing_failsWithoutExposingError() {
        SecurityCase securityCase = securityCaseRepository.save(
                SecurityCase.open(1L, "customer-" + UUID.randomUUID(), CaseType.PAYMENT_FRAUD, Instant.now()));
        casePaymentRepository.save(CasePayment.link(securityCase, System.nanoTime(), Instant.now()));

        reportService.request(securityCase.getId(), 1);

        AiReport saved = reportsOf(securityCase.getId()).getFirst();
        assertThat(saved.getStatus()).isEqualTo(ReportStatus.FAILED);
        assertThat(saved.getReportBody()).containsKey("error");
        assertThat(reportService.findByCase(securityCase.getId()))
                .singleElement()
                .satisfies(snapshot -> {
                    assertThat(snapshot.isFailed()).isTrue();
                    assertThat(snapshot.reportBody()).isNull();
                });
    }

    // FAILED여도 같은 증거 버전은 다시 만들지 않는다 (총 3회 제한을 우회하지 않게)
    @Test
    void request_afterFailedSameVersion_createsNothing() {
        SecurityCase securityCase = securityCaseRepository.save(
                SecurityCase.open(1L, "customer-" + UUID.randomUUID(), CaseType.PAYMENT_FRAUD, Instant.now()));
        casePaymentRepository.save(CasePayment.link(securityCase, System.nanoTime(), Instant.now()));
        reportService.request(securityCase.getId(), 1);

        reportService.request(securityCase.getId(), 1);

        assertThat(reportsOf(securityCase.getId())).hasSize(1);
    }

    // 결제가 더 묶여 증거 버전이 오르면 다음 버전 보고서가 생긴다
    @Test
    void request_newEvidenceVersion_createsNextReportVersion() {
        SecurityCase securityCase = caseWithPayment();
        reportService.request(securityCase.getId(), 1);
        securityCase.increaseEvidenceVersion();
        securityCaseRepository.save(securityCase);

        reportService.request(securityCase.getId(), 2);

        assertThat(reportsOf(securityCase.getId()))
                .extracting(AiReport::getReportVersion, AiReport::getEvidenceVersion)
                .containsExactly(tuple(1, 1), tuple(2, 2));
    }

    // 보고서가 끝난 사이 증거 버전이 올랐으면 다음 버전을 요청한다 (완료 후 비교)
    @Test
    void afterFinished_evidenceChangedMeanwhile_requestsNextVersion() {
        SecurityCase securityCase = caseWithPayment();
        reportService.request(securityCase.getId(), 1);
        AiReport first = reportsOf(securityCase.getId()).getFirst();
        securityCase.increaseEvidenceVersion();
        securityCaseRepository.save(securityCase);

        reportService.afterFinished(new ReportTarget(first.getId(), securityCase.getId(), "PAYMENT_FRAUD", 1, 1));

        assertThat(reportsOf(securityCase.getId()))
                .extracting(AiReport::getEvidenceVersion)
                .containsExactly(1, 2);
    }

    // 같은 Case에 요청 두 개가 동시에 와도 오류 없이 보고서는 하나만 남는다 (UNIQUE 합류)
    @Test
    void request_concurrentSameCase_keepsOneWithoutError() throws Exception {
        SecurityCase securityCase = caseWithPayment();
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            List<Future<?>> calls = List.of(
                    pool.submit(() -> {
                        start.await();
                        reportService.request(securityCase.getId(), 1);
                        return null;
                    }),
                    pool.submit(() -> {
                        start.await();
                        reportService.request(securityCase.getId(), 1);
                        return null;
                    }));
            start.countDown();
            for (Future<?> call : calls) {
                call.get();
            }
        }

        assertThat(reportsOf(securityCase.getId())).hasSize(1);
    }

    // 실패 본문이 화면 응답에 섞이지 않도록 스냅샷은 본문을 비운다 — 성공 본문은 그대로 넘긴다
    @Test
    void findByCase_succeededReport_keepsBody() {
        SecurityCase securityCase = caseWithPayment();
        reportService.request(securityCase.getId(), 1);

        Map<String, Object> body =
                reportService.findByCase(securityCase.getId()).getFirst().reportBody();

        assertThat(body).containsKey("recommendation");
    }
}
