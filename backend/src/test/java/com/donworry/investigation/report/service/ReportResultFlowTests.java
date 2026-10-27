package com.donworry.investigation.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.HeldPaymentFixture;
import com.donworry.MariaDbTestContainerConfig;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.CaseStatus;
import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.report.client.AiServerClient;
import com.donworry.investigation.report.client.AiServerClient.Kind;
import com.donworry.investigation.report.client.AiServerClient.Outcome;
import com.donworry.investigation.report.dto.InvestigationResultRequest;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import com.donworry.investigation.report.repository.AiReportRepository;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.ReportGateway.ReportSnapshot;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

// ai-server 모드에서 사건 → 조사 요청 → 결과 수신 → 완료 · 다시 시도 · 실패를 실제 MariaDB로 확인한다
// ai-server 호출 도구만 가짜로 바꾸고, 결과는 ai-server처럼 HTTP로 보낸다
@Tag("mariadb")
// 주기 검사가 다른 테스트의 남은 시도를 건드리지 않게 대기 시간을 길게 두고, 시간 초과는 check()로 직접 부른다
@SpringBootTest(
        properties = {
            "donworry.report.writer=ai-server",
            "donworry.ai-server.service-key=test-key",
            "donworry.report.result-timeout=PT1H"
        })
@AutoConfigureMockMvc
@Import({MariaDbTestContainerConfig.class, HeldPaymentFixture.class})
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
    HeldPaymentFixture heldPaymentFixture;

    @MockitoBean
    AiServerClient aiServerClient;

    @Autowired
    ReportTimeoutChecker timeoutChecker;

    @Autowired
    ReportRestartRecovery restartRecovery;

    SecurityCase securityCase;
    Long paymentId;

    @BeforeEach
    void setUp() {
        when(aiServerClient.requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt(), anyList()))
                .thenReturn(new Outcome(Kind.ACCEPTED, null));
        securityCase = securityCaseRepository.save(
                SecurityCase.open(1L, "customer-" + UUID.randomUUID(), CaseType.PAYMENT_FRAUD, Instant.now()));
        paymentId = heldPaymentFixture.payment(650_000L, 55, List.of("HIGH_AMOUNT", "NEW_CARD"));
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
                .requestInvestigation(
                        reportId.capture(), attemptId.capture(), anyLong(), anyString(), anyInt(), anyList());
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

    // 조사 요청에 사건의 결제 번호가 실린다 — AI가 결제별 권고에 쓸 수 있는 번호 (#64 실제 실행에서 발견)
    @Test
    void request_sendsCasePaymentIds() {
        requestInvestigation();

        verify(aiServerClient)
                .requestInvestigation(
                        anyLong(), any(), eq(securityCase.getId()), eq("PAYMENT_FRAUD"), eq(1), eq(List.of(paymentId)));
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
                        .requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt(), anyList()));
        Sent second = lastSent();
        assertThat(second.attemptId()).isNotEqualTo(first.attemptId());
        assertThat(report(first.reportId()).getStatus()).isEqualTo(ReportStatus.RUNNING);

        send(second.reportId(), result(second, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        assertThat(report(first.reportId()).getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
    }

    // ai-server가 실패를 3번 보내면(첫 시도 포함) "실패" — 실패 이유는 DB에만, P3 · 화면에는 본문 없음
    @Test
    void result_failedThreeTimes_marksFailed() throws Exception {
        Sent sent = failThreeTimes();

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

    // 조사를 요청하고 ai-server가 실패를 3번 보내 최종 실패로 끝낸다 — 마지막 시도를 돌려준다
    private Sent failThreeTimes() throws Exception {
        Sent sent = requestInvestigation();
        for (int attempt = 1; attempt <= 3; attempt++) {
            send(sent.reportId(), result(sent, "FAILED", null), KEY, 204);
            if (attempt < 3) {
                int calls = attempt + 1;
                await().atMost(Duration.ofSeconds(10))
                        .untilAsserted(() -> verify(aiServerClient, times(calls))
                                .requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt(), anyList()));
                sent = lastSent();
            }
        }
        return sent;
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

    private Map<String, Object> errorOf(Long reportId) {
        return report(reportId).getReportBody();
    }

    // 2분 안에 결과가 안 오고 ai-server에도 없으면 시도 1번 실패 — 3번째에 FAILED (2-18)
    @Test
    void timeout_noResult_retriesThenFails() {
        Sent sent = requestInvestigation();
        Long reportId = sent.reportId();
        for (int attempt = 1; attempt <= 3; attempt++) {
            timeoutChecker.check(reportId, sent.attemptId());
            if (attempt < 3) {
                int calls = attempt + 1;
                await().atMost(Duration.ofSeconds(10))
                        .untilAsserted(() -> verify(aiServerClient, times(calls))
                                .requestInvestigation(
                                        eq(reportId), any(), anyLong(), anyString(), anyInt(), anyList()));
                sent = lastSent();
            }
        }

        assertThat(report(sent.reportId()).getStatus()).isEqualTo(ReportStatus.FAILED);
        assertThat(errorOf(sent.reportId()).get("error").toString()).contains("AI_RESULT_TIMEOUT", "attempts=3");
    }

    // 결과 보내기만 실패하고 ai-server가 결과를 들고 있으면 직접 가져와 완료 (2-18)
    @Test
    void timeout_resultHeldByAiServer_completes() {
        Sent sent = requestInvestigation();
        InvestigationResultRequest held = mapper.convertValue(
                result(sent, "SUCCEEDED", String.valueOf(paymentId)), InvestigationResultRequest.class);
        when(aiServerClient.findResult(sent.reportId(), sent.attemptId())).thenReturn(Optional.of(held));

        timeoutChecker.check(sent.reportId(), sent.attemptId());

        assertThat(report(sent.reportId()).getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
    }

    // 조사 중 새 정보(증거 버전 2)가 오면 v1은 대체됨, v2를 바로 조사 — v1의 늦은 결과는 무시 (2-18)
    @Test
    void newEvidence_supersedesRunningAndIgnoresLateResult() throws Exception {
        Sent first = requestInvestigation();
        SecurityCase merged =
                securityCaseRepository.findById(securityCase.getId()).orElseThrow();
        merged.increaseEvidenceVersion();
        securityCaseRepository.save(merged);

        clearInvocations(aiServerClient);
        reportService.request(securityCase.getId(), 2);
        Sent second = lastSent();

        assertThat(second.reportId()).isNotEqualTo(first.reportId());
        assertThat(report(first.reportId()).getStatus()).isEqualTo(ReportStatus.SUPERSEDED);
        assertThat(report(second.reportId()).getStatus()).isEqualTo(ReportStatus.RUNNING);
        assertThat(report(second.reportId()).getReportVersion()).isEqualTo(2);

        send(first.reportId(), result(first, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        assertThat(report(first.reportId()).getStatus()).isEqualTo(ReportStatus.SUPERSEDED);
        assertThat(report(first.reportId()).getReportBody()).isNull();
    }

    // Spring이 다시 켜지면 조사 중으로 남은 보고서는 실패로 닫고, 사건은 직원 직접 판정으로 (2-18 결정 (가))
    @Test
    void restart_closesUnfinishedAsFailed() {
        Sent sent = requestInvestigation();

        restartRecovery.closeUnfinished();

        assertThat(report(sent.reportId()).getStatus()).isEqualTo(ReportStatus.FAILED);
        assertThat(errorOf(sent.reportId()).get("error").toString()).contains("SERVER_RESTARTED");
        assertThat(securityCaseRepository
                        .findById(securityCase.getId())
                        .orElseThrow()
                        .getStatus())
                .isEqualTo(CaseStatus.DECISION_PENDING);
    }

    // ai-server가 증거 조회 창구를 부르는 것처럼 — 서비스 키 · 보고서 번호 · 시도 번호를 싣는다 (2-19)
    private ResultActions tool(String name, Sent sent, Map<String, Object> args, String key) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reportId", sent.reportId());
        body.put("attemptId", sent.attemptId().toString());
        body.put("args", args);
        var request = post("/internal/ai/tools/{toolName}", name)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body));
        if (key != null) {
            request.header(AiServerClient.SERVICE_KEY_HEADER, key);
        }
        return mvc.perform(request);
    }

    // 조사 중인 현재 시도는 그 사건의 결제 · 적중 Rule을 받고, 준비 전 창구는 빈 결과 — 부른 기록은 보고서 trace 앞에 들어간다
    @Test
    void tools_currentAttempt_returnCaseEvidenceAndAppearInTrace() throws Exception {
        Sent sent = requestInvestigation();

        tool("get_case_payments", sent, Map.of(), KEY)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.data[0].paymentId").value(String.valueOf(paymentId)))
                .andExpect(jsonPath("$.data[0].amount").value(650_000));
        tool("get_fds_evidence", sent, Map.of("paymentIds", List.of(String.valueOf(paymentId))), KEY)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].riskScore").value(55))
                .andExpect(jsonPath("$.data[0].ruleHits[0]").value("HIGH_AMOUNT"));
        tool("get_security_events", sent, Map.of(), KEY)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.note").value("데이터 준비 전"))
                .andExpect(jsonPath("$.data").isEmpty());

        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        List<?> trace = (List<?>) report(sent.reportId()).getReportBody().get("trace");
        // 접수(Spring) → 창구 3개(Spring 기록) → 형식 검사(단계 알림이 없어 결과에 실린 과정) → 저장(Spring)
        assertThat(trace).hasSize(6);
        assertThat(trace.get(0).toString()).contains("kind=REQUEST", "조사 요청 접수");
        assertThat(trace.get(1).toString()).contains("kind=TOOL", "toolName=get_case_payments", "합계 650,000원");
        assertThat(trace.get(2).toString()).contains("toolName=get_fds_evidence", "최고 55점", "HIGH_AMOUNT");
        assertThat(trace.get(3).toString()).contains("toolName=get_security_events", "데이터 준비 전");
        assertThat(trace.get(4).toString()).contains("kind=VALIDATE");
        assertThat(trace.get(5).toString()).contains("kind=SAVE", "stepNo=6");
    }

    // 키 없음 · 틀림 401, 없는 창구 404, 옛 시도 409, 다른 사건 결제 400, 끝난 보고서 409
    @Test
    void tools_outsideScope_rejected() throws Exception {
        Sent first = requestInvestigation();
        tool("get_case_payments", first, Map.of(), null).andExpect(status().isUnauthorized());
        tool("get_case_payments", first, Map.of(), "wrong").andExpect(status().isUnauthorized());
        tool("delete_payment", first, Map.of(), KEY)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RPT_002"));
        tool("get_fds_evidence", first, Map.of("paymentIds", List.of("999999999")), KEY)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RPT_004"));

        send(first.reportId(), result(first, "FAILED", null), KEY, 204);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> verify(aiServerClient, times(2))
                        .requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt(), anyList()));
        tool("get_case_payments", first, Map.of(), KEY)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RPT_003"));

        Sent second = lastSent();
        send(second.reportId(), result(second, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);
        tool("get_case_payments", second, Map.of(), KEY)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RPT_003"));
    }

    // ai-server가 AI 판단 · 형식 검사 한 번이 끝날 때마다 알리는 것처럼 (2-19b)
    private ResultActions step(Sent sent, String kind, boolean ok, String detail) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("attemptId", sent.attemptId().toString());
        body.put("kind", kind);
        body.put("ok", ok);
        body.put("detail", detail);
        body.put("startedAt", Instant.now().toString());
        body.put("durationMs", 1200);
        return mvc.perform(post("/internal/ai/reports/{reportId}/steps", sent.reportId())
                .header(AiServerClient.SERVICE_KEY_HEADER, KEY)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)));
    }

    // 조사 중에는 지금까지의 단계 + "지금 하는 단계"가 보이고, 끝나면 같은 기록이 보고서 과정이 된다 (중복 없이)
    @Test
    void steps_shownWhileRunningAndBecomeTrace() throws Exception {
        Sent sent = requestInvestigation();
        tool("get_fds_evidence", sent, Map.of(), KEY).andExpect(status().isOk());
        step(sent, "LLM_ANSWER", true, "AI 판단 — 다음에 볼 증거 고르기").andExpect(status().isNoContent());

        String runUrl = "/api/investigation/cases/" + securityCase.getId() + "/report/run";
        mvc.perform(get(runUrl))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.steps.length()").value(4))
                .andExpect(jsonPath("$.steps[0].kind").value("REQUEST"))
                .andExpect(jsonPath("$.steps[2].label").value("AI 판단 — 다음에 볼 증거 고르기"))
                .andExpect(jsonPath("$.steps[3].status").value("RUNNING"))
                .andExpect(jsonPath("$.steps[3].durationMs").doesNotExist())
                .andExpect(jsonPath("$.currentStepNo").value(4));

        step(sent, "LLM_ANSWER", true, "AI 판단 — 보고서 작성 (1차)").andExpect(status().isNoContent());
        step(sent, "VALIDATION", true, "구조 검증 통과").andExpect(status().isNoContent());
        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);

        List<?> trace = (List<?>) report(sent.reportId()).getReportBody().get("trace");
        // 접수 · 창구 · AI 판단 2번 · 검사 · 저장 — 결과에 실려 온 과정은 이미 기록돼 있어 다시 넣지 않는다
        assertThat(trace).hasSize(6);
        assertThat(trace.get(4).toString()).contains("kind=VALIDATE", "구조 검증 통과");
        mvc.perform(get(runUrl))
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.steps.length()").value(6))
                .andExpect(jsonPath("$.currentStepNo").doesNotExist());
    }

    // 형식 실패도 단계로 남고, 옛 시도의 단계 알림은 409 — ai-server는 조사를 멈춘다
    @Test
    void steps_failedValidationRecordedAndStaleAttemptRejected() throws Exception {
        Sent first = requestInvestigation();
        step(first, "VALIDATION", false, "구조 검증 실패: 필수 항목 '확인할 것' 누락 → 다시 시도").andExpect(status().isNoContent());
        send(first.reportId(), result(first, "FAILED", null), KEY, 204);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> verify(aiServerClient, times(2))
                        .requestInvestigation(anyLong(), any(), anyLong(), anyString(), anyInt(), anyList()));

        step(first, "LLM_ANSWER", true, "늦은 단계")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RPT_003"));
        String runUrl = "/api/investigation/cases/" + securityCase.getId() + "/report/run";
        mvc.perform(get(runUrl))
                .andExpect(jsonPath("$.steps[1].kind").value("LLM_FAILED"))
                .andExpect(jsonPath("$.steps[1].status").value("FAILED"))
                .andExpect(jsonPath("$.steps[2].kind").value("REQUEST"))
                .andExpect(jsonPath("$.steps[2].got").value("ai-server가 조사를 접수함 (2번째 시도)"));
    }

    // 직원 다시 하기 (2-19e): 최종 실패 뒤 누르면 같은 증거로 v2를 새로 조사 — v1 실패 기록은 그대로
    @Test
    void retry_afterFinalFailure_investigatesNewVersion() throws Exception {
        Sent failed = failThreeTimes();
        clearInvocations(aiServerClient);

        String base = "/api/investigation/cases/" + securityCase.getId() + "/report";
        mvc.perform(post(base + "/retry"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.reportVersion").value(2))
                .andExpect(jsonPath("$.steps[0].kind").value("RETRY"))
                .andExpect(jsonPath("$.steps[0].label").value("직원이 다시 조사 요청"))
                .andExpect(jsonPath("$.steps[0].got").value("v1 조사가 실패해 직원이 다시 요청함"))
                .andExpect(jsonPath("$.steps[1].got").value("ai-server가 조사를 접수함"));
        Sent retried = lastSent();
        assertThat(retried.reportId()).isNotEqualTo(failed.reportId());
        assertThat(report(failed.reportId()).getStatus()).isEqualTo(ReportStatus.FAILED);
        assertThat(report(retried.reportId()).getEvidenceVersion()).isEqualTo(1);
        assertThat(caseStatus()).isEqualTo(CaseStatus.INVESTIGATING);

        send(retried.reportId(), result(retried, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);
        assertThat(report(retried.reportId()).getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
        assertThat(reportService.findByCase(securityCase.getId()))
                .extracting(ReportSnapshot::status)
                .containsExactly("FAILED", "SUCCEEDED");
        assertThat(caseStatus()).isEqualTo(CaseStatus.DECISION_PENDING);
    }

    // 조사 중이거나 성공했으면 다시 하기를 받지 않는다 — 새 버전도 생기지 않는다
    @Test
    void retry_notFailed_rejected() throws Exception {
        Sent sent = requestInvestigation();
        String retry = "/api/investigation/cases/" + securityCase.getId() + "/report/retry";
        mvc.perform(post(retry))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RPT_005"));

        send(sent.reportId(), result(sent, "SUCCEEDED", String.valueOf(paymentId)), KEY, 204);
        mvc.perform(post(retry))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RPT_005"));
        assertThat(reportService.findByCase(securityCase.getId())).hasSize(1);
    }

    private CaseStatus caseStatus() {
        return securityCaseRepository
                .findById(securityCase.getId())
                .orElseThrow()
                .getStatus();
    }
}
