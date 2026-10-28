package com.donworry.investigation.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.FdsRuleFixture;
import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.api.BlocklistRegistry;
import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsEvaluationResponse;
import com.donworry.fds.api.FdsEvaluator;
import com.donworry.fds.api.FdsResult;
import com.donworry.identity.api.CurrentUser;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 관리자 승인 → Rule 끄기 · 차단 해제 실제 반영 (#104 2-7) — jiwon(4, 보안 직원)이 요청, yunseo(5, 보안 관리자)가 승인
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class RuleBlocklistApprovalTests {

    static final CurrentUser.UserView JIWON = new CurrentUser.UserView(4L, "SECURITY_STAFF", null);
    static final CurrentUser.UserView YUNSEO = new CurrentUser.UserView(5L, "SECURITY_MANAGER", null);

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    FdsEvaluator fdsEvaluator;

    @Autowired
    BlocklistRegistry blocklistRegistry;

    @MockitoBean
    CurrentUser currentUser;

    @Test
    void Rule끄기_승인전엔계속계산_관리자승인뒤다음결제부터빠짐() throws Exception {
        long highAmount = FdsRuleFixture.idOf(jdbc, "HIGH_AMOUNT");
        try {
            FdsEvaluationResponse before = evaluate(800_000, null);
            assertThat(matchedRules(before)).contains("HIGH_AMOUNT");

            as(JIWON);
            long approvalId =
                    idOf(request("RULE_DISABLE", "FDS_RULE", highAmount).andExpect(status().isOk()));

            // 승인 전에는 그대로 계산한다
            assertThat(matchedRules(evaluate(800_000, null))).contains("HIGH_AMOUNT");

            as(YUNSEO);
            decide(approvalId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("APPROVED"));
            assertThat(jdbc.queryForMap("SELECT enabled, updated_by FROM fds_rules WHERE rule_id = ?", highAmount))
                    .containsEntry("enabled", false)
                    .containsEntry("updated_by", 5L);

            // 다음 결제부터 이 Rule은 계산하지 않아 점수에서 빠진다
            FdsEvaluationResponse after = evaluate(800_000, null);
            assertThat(matchedRules(after)).doesNotContain("HIGH_AMOUNT");
            assertThat(after.riskScore()).isEqualTo(before.riskScore() - 30);
        } finally {
            jdbc.update("UPDATE fds_rules SET enabled = TRUE, updated_by = NULL WHERE rule_id = ?", highAmount);
        }
    }

    @Test
    void 차단해제_승인뒤같은기기결제가다시점수로판단() throws Exception {
        String device = "dev-release-" + UUID.randomUUID();
        long entryId = block(device);
        assertThat(evaluate(10_000, device).result()).isEqualTo(FdsResult.DENY);

        as(JIWON);
        long approvalId =
                idOf(request("BLOCKLIST_RELEASE", "BLOCKLIST_ENTRY", entryId).andExpect(status().isOk()));
        // 승인 전에는 계속 막는다
        FdsEvaluationResponse pending = evaluate(10_000, device);
        assertThat(pending.result()).isEqualTo(FdsResult.DENY);
        assertThat(matchedRules(pending)).containsExactly("BLOCKLIST");

        as(YUNSEO);
        decide(approvalId).andExpect(status().isOk());
        assertThat(jdbc.queryForMap(
                        "SELECT released_at, released_by FROM blocklist_entries WHERE entry_id = ?", entryId))
                .containsEntry("released_by", 5L)
                .extractingByKey("released_at")
                .isNotNull();

        // 풀린 뒤에는 차단 목록과 대조하지 않고 점수로만 판단한다
        FdsEvaluationResponse released = evaluate(10_000, device);
        assertThat(released.result()).isEqualTo(FdsResult.ALLOW);
        assertThat(matchedRules(released)).doesNotContain("BLOCKLIST");
    }

    @Test
    void 승인요청_없는대상_이미꺼진Rule_이미풀린차단은INV_025_승인때이미바뀌었으면변화없이처리() throws Exception {
        long off = FdsRuleFixture.create(jdbc, false);
        long on = FdsRuleFixture.create(jdbc, true);
        try {
            as(JIWON);
            long missing = ThreadLocalRandom.current().nextLong(9_000_000, 9_900_000);
            invalid(request("RULE_DISABLE", "FDS_RULE", missing));
            invalid(request("RULE_DISABLE", "FDS_RULE", off));
            invalid(request("RULE_DISABLE", "FDS_RULE", FdsRuleFixture.idOf(jdbc, "BLOCKLIST")));
            invalid(request("BLOCKLIST_RELEASE", "BLOCKLIST_ENTRY", missing));
            long releasedEntry = block("dev-released-" + UUID.randomUUID());
            jdbc.update(
                    "UPDATE blocklist_entries SET released_at = UTC_TIMESTAMP(6) WHERE entry_id = ?", releasedEntry);
            invalid(request("BLOCKLIST_RELEASE", "BLOCKLIST_ENTRY", releasedEntry));

            // 요청 뒤 다른 경로로 이미 바뀌었으면: 승인은 처리하고 아무것도 바꾸지 않는다
            long ruleApproval = idOf(request("RULE_DISABLE", "FDS_RULE", on).andExpect(status().isOk()));
            long entry = block("dev-later-" + UUID.randomUUID());
            long entryApproval =
                    idOf(request("BLOCKLIST_RELEASE", "BLOCKLIST_ENTRY", entry).andExpect(status().isOk()));
            jdbc.update("UPDATE fds_rules SET enabled = FALSE WHERE rule_id = ?", on);
            jdbc.update(
                    "UPDATE blocklist_entries SET released_at = UTC_TIMESTAMP(6), released_by = 4 WHERE entry_id = ?",
                    entry);

            as(YUNSEO);
            decide(ruleApproval)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("APPROVED"));
            decide(entryApproval)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("APPROVED"));
            assertThat(jdbc.queryForObject("SELECT updated_by FROM fds_rules WHERE rule_id = ?", Long.class, on))
                    .isNull();
            assertThat(jdbc.queryForObject(
                            "SELECT released_by FROM blocklist_entries WHERE entry_id = ?", Long.class, entry))
                    .isEqualTo(4L);
            JsonNode ruleDetail = auditDetail("RULE_DISABLED", on);
            assertThat(ruleDetail.get("changed").asBoolean()).isFalse();
            assertThat(ruleDetail.get("note").asString()).isEqualTo("이미 꺼져 있음");
            JsonNode entryDetail = auditDetail("BLOCKLIST_RELEASED", entry);
            assertThat(entryDetail.get("changed").asBoolean()).isFalse();
            assertThat(entryDetail.get("note").asString()).isEqualTo("이미 풀려 있음");
        } finally {
            FdsRuleFixture.retire(jdbc, off, on);
        }
    }

    @Test
    void 감사로그_Rule켜기_끄기반영_차단해제가남음() throws Exception {
        long rule = FdsRuleFixture.create(jdbc, false);
        try {
            as(JIWON);
            mvc.perform(post("/api/fds/rules/{ruleId}/enable", rule)).andExpect(status().isOk());
            assertThat(audit("RULE_ENABLED", rule)).containsEntry("actor_id", 4L);

            long ruleApproval = idOf(request("RULE_DISABLE", "FDS_RULE", rule).andExpect(status().isOk()));
            long entry = block("dev-audit-" + UUID.randomUUID());
            long entryApproval =
                    idOf(request("BLOCKLIST_RELEASE", "BLOCKLIST_ENTRY", entry).andExpect(status().isOk()));
            as(YUNSEO);
            decide(ruleApproval).andExpect(status().isOk());
            decide(entryApproval).andExpect(status().isOk());

            // 처리자는 승인한 관리자, 어느 승인 요청으로 바뀌었는지 남긴다
            assertThat(audit("RULE_DISABLED", rule)).containsEntry("actor_id", 5L);
            assertThat(auditDetail("RULE_DISABLED", rule).get("changed").asBoolean())
                    .isTrue();
            assertThat(auditDetail("RULE_DISABLED", rule).get("approvalId").asLong())
                    .isEqualTo(ruleApproval);
            assertThat(audit("BLOCKLIST_RELEASED", entry)).containsEntry("actor_id", 5L);
            assertThat(auditDetail("BLOCKLIST_RELEASED", entry).get("changed").asBoolean())
                    .isTrue();
            assertThat(auditDetail("BLOCKLIST_RELEASED", entry)
                            .get("approvalId")
                            .asLong())
                    .isEqualTo(entryApproval);
        } finally {
            FdsRuleFixture.retire(jdbc, rule);
        }
    }

    private void as(CurrentUser.UserView user) {
        when(currentUser.get()).thenReturn(Optional.of(user));
    }

    private long block(String device) {
        return blocklistRegistry
                .register(new BlocklistRegistry.NewEntry("DEVICE", device, device, "테스트 #104", "STAFF", null, 4L))
                .entryId();
    }

    private FdsEvaluationResponse evaluate(long amount, String device) {
        return fdsEvaluator.evaluate(FdsEvaluationRequest.builder()
                .evaluationRequestId(UUID.randomUUID())
                .paymentId(ThreadLocalRandom.current().nextLong(1_000_000, 9_000_000))
                .customerRef("test-104-" + UUID.randomUUID())
                .amount(amount)
                .paymentRequestedAt(Instant.now())
                .deviceId(device)
                .build());
    }

    private List<String> matchedRules(FdsEvaluationResponse response) {
        return jdbc.queryForList(
                "SELECT rule_code FROM fds_rule_hits WHERE evaluation_id = ? AND outcome = 'MATCH'",
                String.class,
                response.evaluationId());
    }

    private Map<String, Object> audit(String action, long targetId) {
        return jdbc.queryForMap(
                "SELECT actor_id, detail FROM audit_logs WHERE action = ? AND target_id = ? ORDER BY audit_id DESC LIMIT 1",
                action,
                targetId);
    }

    private JsonNode auditDetail(String action, long targetId) {
        return mapper.readTree(String.valueOf(audit(action, targetId).get("detail")));
    }

    private static void invalid(ResultActions result) throws Exception {
        result.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INV_025"));
    }

    private ResultActions request(String requestType, String targetType, long targetId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("requestType", requestType);
        body.put("targetType", targetType);
        body.put("targetId", targetId);
        body.put("targetLabel", "테스트 대상 " + targetId);
        body.put("reason", "테스트 #104 반영");
        return mvc.perform(post("/api/investigation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)));
    }

    private ResultActions decide(long approvalId) throws Exception {
        return mvc.perform(post("/api/investigation/approvals/{id}/decision", approvalId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("decision", "APPROVE", "comment", "확인했습니다"))));
    }

    private long idOf(ResultActions result) throws Exception {
        return mapper.readTree(result.andReturn().getResponse().getContentAsString())
                .get("approvalId")
                .asLong();
    }
}
