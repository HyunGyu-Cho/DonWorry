package com.donworry.investigation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.HeldPaymentFixture;
import com.donworry.MariaDbTestContainerConfig;
import com.donworry.identity.api.CurrentUser;
import com.donworry.investigation.dto.CaseDetailResponse;
import com.donworry.payment.api.PaymentLookup;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

// 판정 = 로그인 직원, AI 권고 반대 판정 → 재인증 → 관리자 승인 (#102)
// 재인증은 실제 API로: 박지원으로 로그인한 세션에서 비밀번호를 다시 넣어 표를 받고, 같은 세션으로 판정한다
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import({MariaDbTestContainerConfig.class, HeldPaymentFixture.class})
class DecisionApprovalTests {

    static final CurrentUser.UserView JIWON = new CurrentUser.UserView(4L, "SECURITY_STAFF", null);
    static final CurrentUser.UserView YUNSEO = new CurrentUser.UserView(5L, "SECURITY_MANAGER", null);

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    HeldPaymentFixture heldPaymentFixture;

    @Autowired
    CaseQueryService caseQueryService;

    @Autowired
    PaymentLookup paymentLookup;

    @MockitoBean
    CurrentUser currentUser;

    MockHttpSession jiwonSession;

    @BeforeEach
    void loginJiwon() throws Exception {
        jiwonSession = (MockHttpSession) mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("loginId", "jiwon", "password", "1234"))))
                .andExpect(status().isOk())
                .andReturn()
                .getRequest()
                .getSession(false);
    }

    // 비밀번호를 다시 넣고 받은 5분 · 1회용 표
    private String reauth() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/identity/reauth")
                                .session(jiwonSession)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(mapper.writeValueAsString(Map.of("password", "1234"))))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("reauthToken")
                .asString();
    }

    @Test
    void 판정_로그인안하면거절_판정자는로그인직원() throws Exception {
        Case c = heldCase(false);

        when(currentUser.get()).thenReturn(Optional.empty());
        decide(c, "REJECT", null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INV_021"));
        assertThat(decisionStaff(c)).isEmpty();

        // 본문에 다른 직원 번호(7)를 넣어도 판정자는 로그인한 박지원(4)
        as(JIWON);
        decide(c, "REJECT", null).andExpect(status().isOk());
        assertThat(decisionStaff(c)).containsExactly(4L);
    }

    @Test
    void 판정_권고반대인데재인증없음_INV_017_아무것도반영안됨() throws Exception {
        Case c = heldCase(true);
        as(JIWON);

        decide(c, "ACCEPT", null)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("INV_017"));
        decide(c, "ACCEPT", "not-a-ticket").andExpect(jsonPath("$.code").value("INV_017"));

        assertThat(decisionStaff(c)).isEmpty();
        assertThat(overrideRequests(c)).isZero();
        assertThat(caseStatus(c)).isEqualTo("DECISION_PENDING");
        assertThat(paymentStatus(c)).isEqualTo(c.paymentStatus());
    }

    @Test
    void 판정_권고반대와재인증_승인대기_결제그대로_관리자승인시반영() throws Exception {
        Case c = heldCase(true);
        as(JIWON);

        long approvalId = mapper.readTree(decide(c, "ACCEPT", reauth())
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.outcome").value("APPROVAL_PENDING"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("approvalId")
                .asLong();
        // 승인 전: 결제는 그대로, 판정도 없다
        assertThat(caseStatus(c)).isEqualTo("APPROVAL_PENDING");
        assertThat(decisionStaff(c)).isEmpty();
        assertThat(paymentStatus(c)).isEqualTo(c.paymentStatus());
        // 승인 대기 중에는 다른 판정도 받지 않는다
        decide(c, "REJECT", null).andExpect(jsonPath("$.code").value("INV_013"));

        as(YUNSEO);
        approve(approvalId, "APPROVE", "고객 통화로 확인됨").andExpect(status().isOk());

        // 승인되면 요청한 박지원 이름으로 판정이 반영되고 사건은 다음 단계로
        assertThat(decisionStaff(c)).containsExactly(4L);
        assertThat(caseStatus(c)).isNotEqualTo("APPROVAL_PENDING");
    }

    @Test
    void 판정_권고반대거절_사건판정대기로돌아감() throws Exception {
        Case c = heldCase(true);
        as(JIWON);
        long approvalId = mapper.readTree(
                        decide(c, "ACCEPT", reauth()).andReturn().getResponse().getContentAsString())
                .get("approvalId")
                .asLong();

        as(YUNSEO);
        approve(approvalId, "REJECT", "근거가 부족합니다").andExpect(status().isOk());

        assertThat(caseStatus(c)).isEqualTo("DECISION_PENDING");
        assertThat(decisionStaff(c)).isEmpty();
        // 다시 판정할 수 있다
        as(JIWON);
        decide(c, "REJECT", null).andExpect(status().isOk());
        assertThat(decisionStaff(c)).containsExactly(4L);
    }

    @Test
    void 감사로그_로그인_판정_승인요청_승인처리가남음() throws Exception {
        // 로그인은 @BeforeEach에서 실제 로그인 API로 했다 (박지원 · 비밀번호 1234)
        as(JIWON);
        Case plain = heldCase(false);
        decide(plain, "REJECT", null).andExpect(status().isOk());
        Case opposite = heldCase(true);
        long approvalId = mapper.readTree(decide(opposite, "ACCEPT", reauth())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("approvalId")
                .asLong();
        as(YUNSEO);
        approve(approvalId, "APPROVE", "확인").andExpect(status().isOk());

        // 감사 로그는 관리자만 본다
        as(JIWON);
        mvc.perform(get("/api/investigation/audit-logs"))
                .andExpect(jsonPath("$.code").value("INV_024"));
        as(YUNSEO);
        mvc.perform(get("/api/investigation/audit-logs").param("actorId", "4"))
                .andExpect(jsonPath("$[?(@.action == 'LOGIN_SUCCESS')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.action == 'DECISION_CONFIRMED' && @.targetId == " + plain.caseId() + ")]")
                        .isNotEmpty())
                .andExpect(jsonPath("$[?(@.action == 'APPROVAL_REQUESTED' && @.targetId == " + approvalId + ")]")
                        .isNotEmpty())
                .andExpect(jsonPath("$[?(@.action == 'DECISION_CONFIRMED' && @.targetId == " + opposite.caseId() + ")]")
                        .isNotEmpty());
        mvc.perform(get("/api/investigation/audit-logs").param("action", "APPROVAL_APPROVED"))
                .andExpect(jsonPath("$[?(@.targetId == " + approvalId + ")].actorId")
                        .value(5))
                .andExpect(jsonPath("$[?(@.targetId == " + approvalId + ")].actorName")
                        .value("최윤서"));
    }

    record Case(
            Long caseId,
            Long paymentId,
            Long casePaymentId,
            int evidenceVersion,
            Long reportId,
            String paymentStatus) {}

    // 보류 결제 한 건짜리 사건. againstAi면 AI 권고를 "승인 취소 검토"로 바꿔 둔다 (ai-server 시연 보고서처럼)
    private Case heldCase(boolean againstAi) throws Exception {
        var held = heldPaymentFixture.held(1L, "decision-" + UUID.randomUUID(), 300_000L, 65);
        CaseDetailResponse detail = caseQueryService.detail(held.caseId());
        Long reportId = detail.reports().getLast().reportId();
        if (againstAi) {
            String json = jdbc.queryForObject(
                    "SELECT report_body FROM ai_reports WHERE report_id = ?", String.class, reportId);
            @SuppressWarnings("unchecked")
            Map<String, Object> body = mapper.readValue(json, Map.class);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> analyses = (List<Map<String, Object>>) body.get("paymentAnalyses");
            analyses.forEach(row -> row.put("recommendation", "REJECT_REVIEW"));
            jdbc.update(
                    "UPDATE ai_reports SET report_body = ? WHERE report_id = ?",
                    mapper.writeValueAsString(body),
                    reportId);
        }
        return new Case(
                held.caseId(),
                held.paymentId(),
                detail.payments().getFirst().casePaymentId(),
                detail.securityCase().evidenceVersion(),
                reportId,
                paymentLookup.find(held.paymentId()).orElseThrow().status());
    }

    private void as(CurrentUser.UserView user) {
        when(currentUser.get()).thenReturn(Optional.of(user));
    }

    private ResultActions decide(Case c, String decision, String reauthToken) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("staffId", 7);
        body.put("evidenceVersion", c.evidenceVersion());
        body.put("reportId", c.reportId());
        body.put(
                "decisions",
                List.of(Map.of("casePaymentId", c.casePaymentId(), "decision", decision, "reason", "테스트 판정 사유")));
        body.put("reauthToken", reauthToken);
        return mvc.perform(post("/api/security-cases/{caseId}/decisions", c.caseId())
                .session(jiwonSession)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)));
    }

    private ResultActions approve(long approvalId, String decision, String comment) throws Exception {
        return mvc.perform(post("/api/investigation/approvals/{id}/decision", approvalId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("decision", decision, "comment", comment))));
    }

    private List<Long> decisionStaff(Case c) {
        return jdbc.queryForList(
                "SELECT staff_id FROM payment_decisions WHERE case_payment_id = ?", Long.class, c.casePaymentId());
    }

    private int overrideRequests(Case c) {
        return jdbc.queryForObject(
                "SELECT COUNT(*) FROM approval_requests WHERE request_type = 'DECISION_OVERRIDE' AND target_id = ?",
                Integer.class,
                c.casePaymentId());
    }

    private String caseStatus(Case c) {
        return jdbc.queryForObject("SELECT status FROM security_cases WHERE case_id = ?", String.class, c.caseId());
    }

    private String paymentStatus(Case c) {
        return paymentLookup.find(c.paymentId()).orElseThrow().status();
    }
}
