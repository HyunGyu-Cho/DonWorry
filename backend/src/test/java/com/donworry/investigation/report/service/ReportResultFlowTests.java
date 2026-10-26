package com.donworry.investigation.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.CaseStatus;
import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.report.client.AiServerClient;
import com.donworry.investigation.report.client.AiServerClient.Kind;
import com.donworry.investigation.report.client.AiServerClient.Outcome;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import com.donworry.investigation.report.repository.AiReportRepository;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.ReportGateway.ReportSnapshot;
import com.donworry.investigation.service.mock.MockPaymentInfoStore;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

// ai-server 모드에서 사건 → 조사 요청 → 결과 수신 → 완료 · 다시 시도 · 실패를 실제 MariaDB로 확인한다
// ai-server 호출 도구만 가짜로 바꾸고, 결과는 ai-server처럼 HTTP로 보낸다
@Tag("mariadb")
@SpringBootTest(properties = {"donworry.report.writer=ai-server", "donworry.ai-server.service-key=test-key"})
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class ReportResultFlowTests {

    static final String KEY = "test-key";

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

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

    @MockitoBean
    AiServerClient aiServerClient;

    SecurityCase securityCase;
    Long paymentId;

    @BeforeEach
    void setUp() {
        when(aiServerClient.requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt()))
                .thenReturn(new Outcome(Kind.ACCEPTED, null));
        securityCase = securityCaseRepository.save(
                SecurityCase.open(1L, "customer-" + UUID.randomUUID(), CaseType.PAYMENT_FRAUD, Instant.now()));
        paymentId = mockPaymentInfoStore
                .registerHeld(650_000L, 55, List.of("HIGH_AMOUNT", "NEW_CARD"), Instant.now())
                .paymentId();
        casePaymentRepository.save(CasePayment.link(securityCase, paymentId, Instant.now()));
    }

    // 조사를 요청하고, ai-server에 보낸 보고서 번호 · 시도 번호를 돌려준다
    private Sent requestInvestigation() {
        clearInvocations(aiServerClient);
        reportService.request(securityCase.getId(), 1);
        return lastSent();
    }

    private Sent lastSent() {
        ArgumentCaptor<Long> reportId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<UUID> attemptId = ArgumentCaptor.forClass(UUID.class);
        verify(aiServerClient, org.mockito.Mockito.atLeastOnce())
                .requestInvestigation(reportId.capture(), attemptId.capture(), anyLong(), anyString(), anyInt());
        return new Sent(reportId.getValue(), attemptId.getValue());
    }

    record Sent(Long reportId, UUID attemptId) {}

    // ai-server가 보내는 결과와 같은 모양
    private Map<String, Object> result(Sent sent, String status, String advicePaymentId) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportType", "PAYMENT_FRAUD");
        report.put("riskScore", 78);
        report.put("verdict", "카드 도용 가능성이 있어 본인 확인이 필요합니다");
        report.put("summary", "처음 쓰는 카드로 평소의 16배 금액을 결제했습니다.");
        report.put("recommendations", List.of(Map.of("label", "승인 취소 검토", "kind", "NEGATIVE")));
        report.put(
                "riskPoints",
                List.of(Map.of("title", "처음 쓰는 카드", "detail", "결제 완료 이력 없음", "source", "get_fds_evidence")));
        report.put("normalPoints", List.of());
        report.put("unknowns", List.of());
        report.put("checks", List.of("구매자 본인 확인 응답"));
        report.put(
                "paymentAdvice",
                // Map.of는 null 값을 받지 않는다 — 실패 결과처럼 결제 ID가 없으면 빈 목록
                advicePaymentId == null
                        ? List.of()
                        : List.of(Map.of(
                                "paymentId", advicePaymentId, "recommendation", "NEEDS_CHECK", "reason", "본인 확인 전")));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reportId", sent.reportId());
        body.put("attemptId", sent.attemptId().toString());
        body.put("caseId", securityCase.getId());
        body.put("caseType", "PAYMENT_FRAUD");
        body.put("evidenceVersion", 1);
        body.put("status", status);
        body.put("report", "SUCCEEDED".equals(status) ? report : null);
        body.put("error", "FAILED".equals(status) ? Map.of("code", "LLM_INVALID_ANSWER", "reason", "형식 3번 실패") : null);
        body.put(
                "steps",
                List.of(Map.of(
                        "kind",
                        "VALIDATION",
                        "ok",
                        true,
                        "detail",
                        "구조 검증 통과",
                        "startedAt",
                        Instant.now().toString(),
                        "durationMs",
                        0)));
        return body;
    }

    private void send(Long reportId, Map<String, Object> body, String key, int expectedStatus) throws Exception {
        var request = post("/internal/ai/reports/{reportId}/result", reportId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body));
        if (key != null) {
            request.header(AiServerClient.SERVICE_KEY_HEADER, key);
        }
        mvc.perform(request).andExpect(status().is(expectedStatus));
    }

    private AiReport report(Long reportId) {
        return aiReportRepository.findById(reportId).orElseThrow();
    }

    // 접수되면 "생성 중", 올바른 결과가 오면 결론 카드로 합쳐 "완료" — 결제 금액이 붙고 사건은 판정 대기로
    @Test
    void result_valid_savesConclusionReportAndCaseAwaitsDecision() throws Exception {
        Sent sent = requestInvestigation();
        assertThat(report(sent.reportId()).getStatus()).isEqualTo(ReportStatus.RUNNING);

        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        AiReport done = report(sent.reportId());
        assertThat(done.getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
        assertThat(done.getReportBody())
                .containsEntry("schemaVersion", 2)
                .containsEntry("caseId", String.valueOf(securityCase.getId()))
                .containsEntry("verdict", "카드 도용 가능성이 있어 본인 확인이 필요합니다");
        assertThat(done.getReportBody().get("paymentRecommendations").toString())
                .contains("650000");
        assertThat(securityCaseRepository
                        .findById(securityCase.getId())
                        .orElseThrow()
                        .getStatus())
                .isEqualTo(CaseStatus.DECISION_PENDING);
    }

    // 서비스 키가 없거나 틀리면 401, 보고서는 그대로
    @Test
    void result_wrongKey_rejected() throws Exception {
        Sent sent = requestInvestigation();

        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), "nope", 401);
        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), null, 401);

        assertThat(report(sent.reportId()).getStatus()).isEqualTo(ReportStatus.RUNNING);
    }

    // 현재 시도가 아닌 결과(옛 시도 · 재시작 전 시도)는 받고도 무시한다
    @Test
    void result_staleAttempt_ignored() throws Exception {
        Sent sent = requestInvestigation();
        Sent stale = new Sent(sent.reportId(), UUID.randomUUID());

        send(sent.reportId(), result(stale, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        assertThat(report(sent.reportId()).getStatus()).isEqualTo(ReportStatus.RUNNING);
    }

    // 사건에 없는 결제 번호를 쓰면 시도 1회 실패 — 새 시도 번호로 다시 요청하고, 그 결과가 맞으면 완료
    @Test
    void result_paymentNotInCase_retriesThenSucceeds() throws Exception {
        Sent first = requestInvestigation();

        send(first.reportId(), result(first, "SUCCEEDED", "999999"), KEY, 204);

        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> verify(aiServerClient, times(2))
                        .requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt()));
        Sent second = lastSent();
        assertThat(second.attemptId()).isNotEqualTo(first.attemptId());
        assertThat(report(first.reportId()).getStatus()).isEqualTo(ReportStatus.RUNNING);

        send(second.reportId(), result(second, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        assertThat(report(first.reportId()).getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
    }

    // ai-server가 실패를 3번 보내면(첫 시도 포함) "실패" — 실패 이유는 DB에만, P3 · 화면에는 본문 없음
    @Test
    void result_failedThreeTimes_marksFailed() throws Exception {
        Sent sent = requestInvestigation();
        for (int attempt = 1; attempt <= 3; attempt++) {
            send(sent.reportId(), result(sent, "FAILED", null), KEY, 204);
            if (attempt < 3) {
                int calls = attempt + 1;
                await().atMost(Duration.ofSeconds(10))
                        .untilAsserted(() -> verify(aiServerClient, times(calls))
                                .requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt()));
                sent = lastSent();
            }
        }

        AiReport failed = report(sent.reportId());
        assertThat(failed.getStatus()).isEqualTo(ReportStatus.FAILED);
        assertThat(failed.getReportBody().get("error").toString()).contains("AI_RESULT_FAILED", "attempts=3");
        assertThat(reportService.findByCase(securityCase.getId()))
                .singleElement()
                .extracting(ReportSnapshot::reportBody)
                .isNull();
        // 실패도 끝난 보고서라 직원이 직접 판정할 수 있다
        assertThat(securityCaseRepository
                        .findById(securityCase.getId())
                        .orElseThrow()
                        .getStatus())
                .isEqualTo(CaseStatus.DECISION_PENDING);
    }

    // 이미 끝난 보고서에 결과가 또 오면 무시 (같은 결과가 두 번 와도 한 번만 반영)
    @Test
    void result_twice_appliedOnce() throws Exception {
        Sent sent = requestInvestigation();
        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);
        Instant completedAt = report(sent.reportId()).getCompletedAt();

        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        assertThat(report(sent.reportId()).getCompletedAt()).isEqualTo(completedAt);
    }
}
