package com.donworry.investigation.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.FdsRuleFixture;
import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.api.BlocklistRegistry;
import com.donworry.identity.api.CurrentUser;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

// 관리자 승인 요청 만들기 · 처리 (#102) — 시연 직원 jiwon(4, 보안 직원) · yunseo(5, 보안 관리자)
// 다른 테스트와 대상이 겹치지 않게 테스트용 Rule · 차단 항목을 새로 만든다 (#104부터 대상이 실제로 있어야 함)
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class ApprovalFlowTests {

    static final CurrentUser.UserView JIWON = new CurrentUser.UserView(4L, "SECURITY_STAFF", null);
    static final CurrentUser.UserView YUNSEO = new CurrentUser.UserView(5L, "SECURITY_MANAGER", null);

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    BlocklistRegistry blocklistRegistry;

    @MockitoBean
    CurrentUser currentUser;

    @Test
    void 승인처리_본인요청_보안직원_이미끝난요청_거절이유없음_막힘() throws Exception {
        long rule = FdsRuleFixture.create(jdbc, true);
        try {
            decideBlocked(rule);
        } finally {
            FdsRuleFixture.retire(jdbc, rule);
        }
    }

    private void decideBlocked(long rule) throws Exception {
        as(JIWON);
        long ruleOff = idOf(create("RULE_DISABLE", "FDS_RULE", rule).andExpect(status().isOk()));

        // 보안 직원은 승인할 수 없다
        decide(ruleOff, "APPROVE", null).andExpect(jsonPath("$.code").value("INV_016"));

        // 관리자도 자기가 요청한 건은 승인할 수 없다
        as(YUNSEO);
        long own = idOf(
                create("BLOCKLIST_RELEASE", "BLOCKLIST_ENTRY", activeEntry()).andExpect(status().isOk()));
        decide(own, "APPROVE", null).andExpect(jsonPath("$.code").value("INV_010"));

        // 거절은 이유가 있어야 한다
        decide(ruleOff, "REJECT", " ").andExpect(jsonPath("$.code").value("INV_015"));

        decide(ruleOff, "APPROVE", "확인했습니다")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.decidedBy").value(5));
        // 이미 끝난 요청은 다시 처리할 수 없다
        decide(ruleOff, "REJECT", "다시 거절").andExpect(jsonPath("$.code").value("INV_012"));

        // 로그인하지 않으면 요청도 처리도 못 한다
        when(currentUser.get()).thenReturn(Optional.empty());
        decide(own, "APPROVE", null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INV_021"));
    }

    @Test
    void 승인요청_같은대상대기중이면하나만_INV_013_기한지나면만료() throws Exception {
        long target = FdsRuleFixture.create(jdbc, true);
        try {
            pendingOnlyOnce(target);
        } finally {
            FdsRuleFixture.retire(jdbc, target);
        }
    }

    private void pendingOnlyOnce(long target) throws Exception {
        as(JIWON);
        long first = idOf(create("RULE_DISABLE", "FDS_RULE", target).andExpect(status().isOk()));
        create("RULE_DISABLE", "FDS_RULE", target).andExpect(jsonPath("$.code").value("INV_013"));

        // 24시간이 지나면 만료로 보이고 처리할 수 없다 → 같은 대상에 다시 요청할 수 있다
        jdbc.update(
                "UPDATE approval_requests SET expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 SECOND WHERE approval_id = ?",
                first);
        mvc.perform(get("/api/investigation/approvals"))
                .andExpect(
                        jsonPath("$[?(@.approvalId == " + first + ")].status").value("EXPIRED"));
        as(YUNSEO);
        decide(first, "APPROVE", null).andExpect(jsonPath("$.code").value("INV_012"));
        as(JIWON);
        create("RULE_DISABLE", "FDS_RULE", target).andExpect(status().isOk());
    }

    private void as(CurrentUser.UserView user) {
        when(currentUser.get()).thenReturn(Optional.of(user));
    }

    // 요청 대상은 실제로 있어야 한다 (#104 INV_025) — 테스트마다 새 차단 항목
    private long activeEntry() {
        String device = "dev-approval-" + UUID.randomUUID();
        return blocklistRegistry
                .register(new BlocklistRegistry.NewEntry("DEVICE", device, device, "테스트 #102", "STAFF", null, 4L))
                .entryId();
    }

    private ResultActions create(String requestType, String targetType, long targetId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("requestType", requestType);
        body.put("targetType", targetType);
        body.put("targetId", targetId);
        body.put("targetLabel", "테스트 대상 " + targetId);
        body.put("reason", "테스트 #102 승인 요청");
        return mvc.perform(post("/api/investigation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)));
    }

    private ResultActions decide(long approvalId, String decision, String comment) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("decision", decision);
        body.put("comment", comment);
        return mvc.perform(post("/api/investigation/approvals/{id}/decision", approvalId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)));
    }

    private long idOf(ResultActions result) throws Exception {
        return mapper.readTree(result.andReturn().getResponse().getContentAsString())
                .get("approvalId")
                .asLong();
    }
}
