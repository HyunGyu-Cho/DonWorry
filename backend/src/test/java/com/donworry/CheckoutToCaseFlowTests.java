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

        // 매입 보류여도 구매자에게는 "결제 완료" — 검토는 뒤에서 (S-3, #86)
        assertThat(result.get("outcome")).isEqualTo("PAID");
        assertThat(result.get("title")).isEqualTo("결제가 완료되었습니다");
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

    // ㉠ 화면 조회 (#82): 보류된 결제가 경보 · 사건 · 결제 · Rule 화면에 실제 값으로 보인다
    @Test
    void heldPayment_visibleOnReadScreens() throws Exception {
        Long paymentId = Long.valueOf(
                pay(order("cake-set"), "demo-card-new", 200).get("paymentId").toString());
        await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(casePaymentRepository.findByPaymentId(paymentId))
                        .isPresent());
        Long caseId = casePaymentRepository
                .findByPaymentId(paymentId)
                .orElseThrow()
                .getSecurityCase()
                .getId();

        mvc.perform(get("/api/fds/rules"))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$[?(@.ruleCode == 'NEW_CARD')].displayName").value("처음 쓰는 카드"));
        mvc.perform(get("/api/fds/rules/hit-stats").param("days", "7"))
                .andExpect(jsonPath("$[?(@.ruleCode == 'AMOUNT_SPIKE')].daily.length()")
                        .value(7));
        mvc.perform(get("/api/investigation/payment-alerts")
                        .param("attentionOnly", "true")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.paymentId == " + paymentId + ")].customerLabel")
                        .value("김민수"))
                .andExpect(jsonPath("$.content[?(@.paymentId == " + paymentId + ")].caseId")
                        .value(String.valueOf(caseId)))
                .andExpect(jsonPath("$.content[?(@.paymentId == " + paymentId + ")].orderTitle")
                        .value("단체 행사용 케이크 세트"));
        mvc.perform(get("/api/payment/payments/{id}", paymentId))
                .andExpect(jsonPath("$.status").value("HELD"))
                .andExpect(jsonPath("$.cardLast4").value("1173"));
        mvc.perform(get("/api/payment/payments/{id}", 987654321L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PAY_001"));
        mvc.perform(get("/api/security-cases/{id}", caseId))
                .andExpect(jsonPath("$.securityCase.subjectLabel").value("김민수 고객"))
                .andExpect(jsonPath("$.payments[0].hitRuleCodes.length()").value(3))
                .andExpect(jsonPath("$.payments[0].evaluationId").isNumber());
        mvc.perform(get("/api/security-cases/handoffs")).andExpect(status().isOk());
        mvc.perform(get("/api/investigation/approvals")).andExpect(status().isOk());
    }

    // ㉢ 구매자 답변 (#82): 보류되면 확인 요청이 남고, 시연 링크로 "결제하지 않았어요" → 사건 기록 · 증거 버전 2 · AI 재조사
    @Test
    void buyerDenies_caseGetsNewEvidenceAndReinvestigates() throws Exception {
        Long paymentId = Long.valueOf(
                pay(order("cake-set"), "demo-card-new", 200).get("paymentId").toString());
        await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(casePaymentRepository.findByPaymentId(paymentId))
                        .isPresent());
        Long caseId = casePaymentRepository
                .findByPaymentId(paymentId)
                .orElseThrow()
                .getSecurityCase()
                .getId();

        // 같은 고객 결제는 30분 안이면 한 사건으로 묶이므로 (다른 테스트 포함) 답변 전 버전에서 +1을 본다
        int before = mapper.readTree(mvc.perform(get("/api/security-cases/{id}", caseId))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("securityCase")
                .get("evidenceVersion")
                .asInt();
        String link = mapper.readTree(mvc.perform(post("/api/demo/buyer-confirmations/{id}/link", paymentId))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("url")
                .asString();
        String token = link.substring("/confirm/".length());
        mvc.perform(get("/api/public/buyer-confirmations/{token}", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderTitle").value("단체 행사용 케이크 세트"))
                .andExpect(jsonPath("$.answered").doesNotExist());

        String answer = mapper.writeValueAsString(Map.of("answer", "NOT_MINE"));
        mvc.perform(post("/api/public/buyer-confirmations/{token}", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("NOT_MINE"));
        mvc.perform(post("/api/public/buyer-confirmations/{token}", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answer))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAY_011"));
        mvc.perform(get("/api/public/buyer-confirmations/{token}", "no-such-link"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("PAY_010"));

        mvc.perform(get("/api/security-cases/{id}", caseId))
                .andExpect(jsonPath("$.securityCase.evidenceVersion").value(before + 1))
                .andExpect(jsonPath("$.history[?(@.eventType == 'BUYER_RESPONDED')].eventData.answer")
                        .value("NOT_MINE"))
                .andExpect(jsonPath("$.reports[?(@.evidenceVersion == " + (before + 1) + ")]")
                        .isNotEmpty());
    }

    // S-3 (#86): 사장님은 로그인한 가게의 "검토 중"을 보고, 로그인하지 않으면 볼 수 없다
    @Test
    void owner_seesCheckingForHeldPayment() throws Exception {
        Long paymentId = Long.valueOf(
                pay(order("cake-set"), "demo-card-new", 200).get("paymentId").toString());
        mvc.perform(get("/api/payment/owner/results"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PAY_030"));

        var login = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("loginId", "boss", "password", "1234"))))
                .andExpect(status().isOk())
                .andReturn();
        var session = (org.springframework.mock.web.MockHttpSession)
                login.getRequest().getSession(false);
        mvc.perform(get("/api/payment/owner/results").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.paymentId == '" + paymentId + "')].result")
                        .value("CHECKING"))
                .andExpect(jsonPath("$[?(@.paymentId == '" + paymentId + "')].guide")
                        .value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("주문은 그대로 진행"))));
        // 시드의 정상 결제(지난 결제 5건)는 보안 확인 결과에 없다
        mvc.perform(get("/api/payment/owner/results").session(session).param("result", "ACCEPTED"))
                .andExpect(jsonPath("$[?(@.orderRef == 'DEMO-PAST-1')]").isEmpty());
        mvc.perform(get("/api/payment/notifications").session(session).param("paymentId", String.valueOf(paymentId)))
                .andExpect(jsonPath("$[0].kind").value("CHECK"));
    }
}
