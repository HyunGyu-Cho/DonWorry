package com.donworry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.payment.api.PaymentLookup;
import java.time.Duration;
import java.util.List;
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

// 시연 뼈대 ① (#82): 테스트 상점 → 결제창 → FDS 3개 Rule → 매입 보류 → 사건 자동 생성까지 실제 DB로
// 구매자 김민수는 시드 이력(평균 4만 원 · 자주 쓰는 카드)이 있다 (V20261027_094018)
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class CheckoutToCaseFlowTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    PaymentLookup paymentLookup;

    @Autowired
    FdsPaymentEvaluations fdsPaymentEvaluations;

    @Autowired
    CasePaymentRepository casePaymentRepository;

    private String order(String productId) throws Exception {
        String body = mvc.perform(post("/api/demo/test-shop/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("productId", productId))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return mapper.readTree(body).get("sessionToken").asString();
    }

    private Map<?, ?> pay(String token, String cardToken, int expectedStatus) throws Exception {
        String body = mvc.perform(post("/api/checkout/{token}/pay", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("cardToken", cardToken))))
                .andExpect(status().is(expectedStatus))
                .andReturn()
                .getResponse()
                .getContentAsString();
        return mapper.readValue(body, Map.class);
    }

    // 65만 원을 처음 쓰는 카드로 → 55점 직원 확인 → 매입 보류 → 사건 · 구매자에게는 "확인 중"만
    @Test
    void newCardHighAmount_heldAndCaseCreated() throws Exception {
        String token = order("cake-set");
        mvc.perform(get("/api/checkout/{token}", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderTitle").value("단체 행사용 케이크 세트"))
                .andExpect(jsonPath("$.amount").value(650000))
                .andExpect(jsonPath("$.buyerName").value("김민수"))
                .andExpect(jsonPath("$.buyerEmailMasked").value("m***@example.com"))
                .andExpect(jsonPath("$.status").value("OPEN"));

        Map<?, ?> result = pay(token, "demo-card-new", 200);

        assertThat(result.get("outcome")).isEqualTo("CHECKING");
        assertThat(result.get("returnUrl").toString()).startsWith("/demo/shop/result?paymentId=");
        Long paymentId = Long.valueOf(result.get("paymentId").toString());
        assertThat(paymentLookup.find(paymentId).orElseThrow().status()).isEqualTo("HELD");
        var evaluation = fdsPaymentEvaluations.latestForPayment(paymentId).orElseThrow();
        assertThat(evaluation.riskScore()).isEqualTo(55);
        assertThat(evaluation.matchedRuleCodes()).containsExactlyInAnyOrder("HIGH_AMOUNT", "AMOUNT_SPIKE", "NEW_CARD");
        await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(casePaymentRepository.findByPaymentId(paymentId))
                        .isPresent());
        mvc.perform(get("/api/checkout/{token}", token))
                .andExpect(jsonPath("$.status").value("PAID"));
    }

    // 같은 결제창으로 두 번 결제할 수 없다 · 없는 결제창은 만료와 같은 410
    @Test
    void secondPayAndUnknownToken_rejected() throws Exception {
        String token = order("strawberry");
        assertThat(pay(token, "demo-card-usual", 200).get("outcome")).isEqualTo("PAID");
        assertThat(pay(token, "demo-card-usual", 409).get("code")).isEqualTo("PAY_023");
        assertThat(pay("no-such-token", "demo-card-usual", 410).get("code")).isEqualTo("PAY_022");
    }

    // 자주 쓰는 카드 평범한 주문은 결제 완료 · 한도 초과 카드는 카드사 거절 — 사건은 생기지 않는다
    @Test
    void usualCardPaidAndDeclineCardDeclined() throws Exception {
        Map<?, ?> paid = pay(order("strawberry"), "demo-card-usual", 200);
        Map<?, ?> declined = pay(order("cake-set"), "demo-card-decline", 200);

        assertThat(List.of(paid.get("outcome"), declined.get("outcome"))).containsExactly("PAID", "DECLINED");
        Long declinedId = Long.valueOf(declined.get("paymentId").toString());
        assertThat(paymentLookup.find(declinedId).orElseThrow().status()).isEqualTo("DECLINED");
        assertThat(casePaymentRepository.findByPaymentId(declinedId)).isEmpty();
    }
}
