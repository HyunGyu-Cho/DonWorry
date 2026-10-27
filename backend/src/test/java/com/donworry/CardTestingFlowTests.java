package com.donworry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.fds.api.FdsResult;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

// 시연 ⑤ 카드 테스팅 장면 (#98 F-9): 테스트 상점 "해외 VPN"에서 도난 카드를 번갈아 결제하면 3장째에 카드 테스팅이 걸린다
// 시연 설정을 켜야 테스트 상점이 고른 접속 환경 헤더를 결제창이 믿는다
@Tag("mariadb")
@SpringBootTest(properties = "donworry.demo.fake-client-ip=true")
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class CardTestingFlowTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    FdsPaymentEvaluations evaluations;

    @Test
    void 시연흐름_해외VPN_도난카드3장_3번째카드테스팅_DENY() throws Exception {
        var first = payFromVpn("demo-card-stolen-1");
        var second = payFromVpn("demo-card-stolen-2");
        var third = payFromVpn("demo-card-stolen-3");

        // 1 · 2장째는 카드 테스팅이 아니다 (같은 IP 카드 1 · 2장)
        assertThat(evaluations.latestForPayment(first).orElseThrow().matchedRuleCodes())
                .contains("HIGH_RISK_COUNTRY_IP")
                .doesNotContain("CARD_TESTING");
        assertThat(evaluations.latestForPayment(second).orElseThrow().matchedRuleCodes())
                .doesNotContain("CARD_TESTING");
        // 3장째: 카드 테스팅 45 + 고위험 국가 IP 40 → 거절
        var evaluation = evaluations.latestForPayment(third).orElseThrow();
        assertThat(evaluation.matchedRuleCodes()).contains("CARD_TESTING", "HIGH_RISK_COUNTRY_IP");
        assertThat(evaluation.result()).isEqualTo(FdsResult.DENY);
    }

    private Long payFromVpn(String cardToken) throws Exception {
        String body = mvc.perform(post("/api/demo/test-shop/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("productId", "strawberry"))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String token = mapper.readTree(body).get("sessionToken").asString();
        String paid = mvc.perform(post("/api/checkout/{token}/pay", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("cardToken", cardToken)))
                        .header("X-Demo-Client-IP", "45.83.64.12")
                        .header("X-Demo-Device-Id", "demo-device-attacker"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return mapper.readTree(paid).get("paymentId").asLong();
    }
}
