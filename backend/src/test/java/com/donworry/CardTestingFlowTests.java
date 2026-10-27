package com.donworry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.fds.api.FdsResult;
import com.donworry.identity.api.CurrentUser;
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

// 시연 ⑤ 카드 테스팅 → 차단 (#98 F-9, #100 S-4)
// 테스트 상점 "처음 온 손님" + "해외 VPN"으로 도난 카드를 번갈아 결제 → 3장째 카드 테스팅 DENY
// → 보안 직원이 결제 경보에서 기기를 차단 목록에 등록 → 같은 기기의 다음 결제는 점수 계산 없이 바로 막힌다
// 시연 설정을 켜야 테스트 상점이 고른 접속 환경 헤더를 결제창이 믿는다
@Tag("mariadb")
@SpringBootTest(properties = "donworry.demo.fake-client-ip=true")
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class CardTestingFlowTests {

    static final String VPN_IP = "45.83.64.12";
    static final String REASON = "테스트 #100 시연 ⑤ 기기 차단";
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

    // 이 테스트가 올린 차단을 풀어 다른 테스트 결제가 막히지 않게
    @AfterEach
    void releaseTestEntries() {
        jdbc.update(
                "UPDATE blocklist_entries SET released_at = UTC_TIMESTAMP(6) WHERE reason = ? AND released_at IS NULL",
                REASON);
    }

    @Test
    void 시연5흐름_처음온손님VPN_3장째DENY_차단등록_같은기기다음결제즉시차단() throws Exception {
        // 브라우저 탭 하나 = 처음 온 손님 한 명 · 손님마다 다른 기기
        String guestKey = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String device = "demo-device-attacker-" + guestKey;

        var first = payFromVpn(guestKey, device, "demo-card-stolen-1");
        var second = payFromVpn(guestKey, device, "demo-card-stolen-2");
        var third = payFromVpn(guestKey, device, "demo-card-stolen-3");

        // 1 · 2장째는 카드 테스팅이 아니다 — 결제 이력 없는 손님이라 첫 시도부터 거절되지도 않는다
        var firstEvaluation = evaluations.latestForPayment(first).orElseThrow();
        assertThat(firstEvaluation.matchedRuleCodes())
                .contains("HIGH_RISK_COUNTRY_IP")
                .doesNotContain("CARD_TESTING");
        assertThat(firstEvaluation.result()).isNotEqualTo(FdsResult.DENY);
        assertThat(evaluations.latestForPayment(second).orElseThrow().matchedRuleCodes())
                .doesNotContain("CARD_TESTING");
        // 3장째: 카드 테스팅 45 + 고위험 국가 IP 40 → 거절
        var denied = evaluations.latestForPayment(third).orElseThrow();
        assertThat(denied.matchedRuleCodes()).contains("CARD_TESTING", "HIGH_RISK_COUNTRY_IP");
        assertThat(denied.result()).isEqualTo(FdsResult.DENY);

        // 보안 직원이 거절된 경보에서 기기만 골라 차단 목록에 등록
        when(currentUser.get()).thenReturn(Optional.of(STAFF));
        mvc.perform(post("/api/investigation/payment-alerts/{id}/blocklist", denied.evaluationId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("types", List.of("DEVICE"), "reason", REASON))))
                .andExpect(status().isOk());

        // 같은 기기로 다른 카드를 시도하면 차단 목록 한 줄로 바로 막힌다
        var blocked = evaluations
                .latestForPayment(payFromVpn(guestKey, device, "demo-card-stolen-5"))
                .orElseThrow();
        assertThat(blocked.matchedRuleCodes()).containsExactly("BLOCKLIST");
        assertThat(blocked.result()).isEqualTo(FdsResult.DENY);
        assertThat(blocked.riskScore()).isEqualTo(100);
    }

    private Long payFromVpn(String guestKey, String device, String cardToken) throws Exception {
        String body = mvc.perform(post("/api/demo/test-shop/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                Map.of("productId", "strawberry", "buyer", "GUEST", "guestKey", guestKey))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String token = mapper.readTree(body).get("sessionToken").asString();
        String paid = mvc.perform(post("/api/checkout/{token}/pay", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("cardToken", cardToken)))
                        .header("X-Demo-Client-IP", VPN_IP)
                        .header("X-Demo-Device-Id", device))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return mapper.readTree(paid).get("paymentId").asLong();
    }
}
