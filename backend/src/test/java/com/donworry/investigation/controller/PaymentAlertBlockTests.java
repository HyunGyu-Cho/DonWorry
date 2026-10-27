package com.donworry.investigation.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.identity.api.CurrentUser;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
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
import tools.jackson.databind.json.JsonMapper;

// 결제 경보에서 차단 목록 등록 (#100 F-10) — 결제창 결제로 만든 실제 경보 · 실제 DB
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class PaymentAlertBlockTests {

    static final String REASON = "테스트 #100 차단 등록";
    static final CurrentUser.UserView STAFF = new CurrentUser.UserView(4L, "SECURITY_STAFF", null);

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    FdsPaymentEvaluations evaluations;

    @MockitoBean
    CurrentUser currentUser;

    // 이 테스트가 올린 차단(시연 카드 포함)을 풀어 다른 테스트 결제가 막히지 않게
    @AfterEach
    void releaseTestEntries() {
        jdbc.update(
                "UPDATE blocklist_entries SET released_at = UTC_TIMESTAMP(6) WHERE reason = ? AND released_at IS NULL",
                REASON);
    }

    // 카드는 화면에 끝자리만 있지만 서버가 결제 번호로 카드 지문을 찾아 저장하고, 응답 · 목록에는 끝자리만 보인다
    @Test
    void 차단등록_결제번호로카드지문찾아저장_화면엔끝자리만() throws Exception {
        when(currentUser.get()).thenReturn(Optional.of(STAFF));
        long evaluationId = evaluationOf(payWith("demo-card-stolen-4", "DEV-BLOCK-" + UUID.randomUUID()));

        String body = block(evaluationId, List.of("CARD", "DEVICE"), 200);

        assertThat(body).contains("**** 3104").doesNotContain("demo-fp-stolen-4");
        assertThat(jdbc.queryForObject(
                        "SELECT COUNT(*) FROM blocklist_entries WHERE entry_type = 'CARD' AND entry_value = 'demo-fp-stolen-4'"
                                + " AND released_at IS NULL",
                        Integer.class))
                .isEqualTo(1);
        mvc.perform(get("/api/fds/blocklist"))
                .andExpect(jsonPath("$[?(@.entryValue == 'demo-fp-stolen-4')]").isEmpty())
                .andExpect(jsonPath("$[?(@.entryValue == '**** 3104')]").isNotEmpty());
    }

    // 로그인 안 함 · 사장님은 등록할 수 없고, 같은 값을 두 번 올려도 한 줄만 남는다
    @Test
    void 차단등록_보안직원만_같은값은한번만() throws Exception {
        String device = "DEV-BLOCK-" + UUID.randomUUID();
        long evaluationId = evaluationOf(payWith("demo-card-usual", device));

        when(currentUser.get()).thenReturn(Optional.empty());
        mvc.perform(blockRequest(evaluationId, List.of("DEVICE")))
                .andExpect(jsonPath("$.code").value("INV_018"));
        when(currentUser.get()).thenReturn(Optional.of(new CurrentUser.UserView(9L, "OWNER", 1L)));
        mvc.perform(blockRequest(evaluationId, List.of("DEVICE"))).andExpect(status().isForbidden());

        when(currentUser.get()).thenReturn(Optional.of(STAFF));
        block(evaluationId, List.of("DEVICE"), 200);
        String again = block(evaluationId, List.of("DEVICE"), 200);

        assertThat(mapper.readTree(again).get(0).get("already").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject(
                        "SELECT COUNT(*) FROM blocklist_entries WHERE entry_type = 'DEVICE' AND entry_value = ?",
                        Integer.class,
                        device))
                .isEqualTo(1);
    }

    // 차단 뒤 같은 기기로 결제하면 막히고, 차단 목록 화면에 7일 막은 결제 수 · 마지막 차단 시각이 보인다
    @Test
    void 차단항목_7일막은결제수_마지막시각() throws Exception {
        when(currentUser.get()).thenReturn(Optional.of(STAFF));
        String device = "DEV-BLOCK-" + UUID.randomUUID();
        long evaluationId = evaluationOf(payWith("demo-card-usual", device));
        block(evaluationId, List.of("DEVICE"), 200);

        Long blockedPayment = payWith("demo-card-usual", device);

        var evaluation = evaluations.latestForPayment(blockedPayment).orElseThrow();
        assertThat(evaluation.matchedRuleCodes()).containsExactly("BLOCKLIST");
        mvc.perform(get("/api/fds/blocklist"))
                .andExpect(jsonPath("$[?(@.entryValue == '" + device + "')].hits7d")
                        .value(1))
                .andExpect(jsonPath("$[?(@.entryValue == '" + device + "')].lastHitAt")
                        .isNotEmpty());
    }

    private Long payWith(String cardToken, String device) throws Exception {
        String order = mvc.perform(post("/api/demo/test-shop/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("productId", "strawberry"))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String token = mapper.readTree(order).get("sessionToken").asString();
        String paid = mvc.perform(post("/api/checkout/{token}/pay", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("cardToken", cardToken)))
                        .cookie(new Cookie("dw_device", device)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return mapper.readTree(paid).get("paymentId").asLong();
    }

    private long evaluationOf(Long paymentId) {
        return evaluations.latestForPayment(paymentId).orElseThrow().evaluationId();
    }

    private org.springframework.test.web.servlet.RequestBuilder blockRequest(long evaluationId, List<String> types)
            throws Exception {
        return post("/api/investigation/payment-alerts/{id}/blocklist", evaluationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("types", types, "reason", REASON)));
    }

    private String block(long evaluationId, List<String> types, int expected) throws Exception {
        return mvc.perform(blockRequest(evaluationId, types))
                .andExpect(status().is(expected))
                .andReturn()
                .getResponse()
                .getContentAsString();
    }
}
