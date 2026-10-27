package com.donworry.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsEvaluator;
import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

// FDS 평가 입력 넓히기 (#96 F-3): P5가 결제 정보 · 고객 이력을 FDS 요청에 실어 보내는지 실제 DB로
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class PaymentFdsInputTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    PaymentRepository payments;

    @Autowired
    PaymentCreationService creation;

    @MockitoSpyBean
    FdsEvaluator evaluator;

    @Autowired
    PaymentEvaluationFlowService flow;

    @Autowired
    FdsPaymentEvaluations evaluations;

    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    // 결제창에서 카드를 고르면 결제창이 모은 IP · 기기와 카드 · 구매자 정보가 FDS 요청까지 간다
    @Test
    void 결제창결제_FDS요청_카드지문기기IP이메일가맹점과거정상결제_전달() throws Exception {
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
                        .content(mapper.writeValueAsString(Map.of("cardToken", "demo-card-new")))
                        .cookie(new Cookie("dw_device", "DEV-TEST-96"))
                        .with(request -> {
                            request.setRemoteAddr("121.134.55.10");
                            return request;
                        }))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        Long paymentId = mapper.readTree(paid).get("paymentId").asLong();

        var captor = ArgumentCaptor.forClass(FdsEvaluationRequest.class);
        verify(evaluator, atLeastOnce()).evaluate(captor.capture());
        FdsEvaluationRequest request = captor.getAllValues().stream()
                .filter(r -> r.paymentId().equals(paymentId))
                .findFirst()
                .orElseThrow();
        Payment payment = payments.findById(paymentId).orElseThrow();
        assertThat(request.merchantId()).isEqualTo(payment.getMerchantId());
        assertThat(request.cardFingerprint()).isEqualTo("demo-fp-new");
        assertThat(request.deviceId()).isEqualTo("DEV-TEST-96");
        assertThat(request.clientIp()).isEqualTo("121.134.55.10");
        // 접속 IP의 나라 · 회선은 P5가 IP 이름표로 찾아 넘긴다 (#98 F-5)
        assertThat(request.clientCountry()).isEqualTo("KR");
        assertThat(request.clientIpType()).isEqualTo("DOMESTIC");
        assertThat(request.buyerEmail()).isEqualTo("minsu@example.com");
        // 김민수는 시드 이력(매입 완료 5건)이 있고, 이 카드로는 끝낸 결제가 없다
        assertThat(request.hasPriorCapturedPayment()).isTrue();
        assertThat(request.cardCompletedPayments()).isZero();
    }

    // 과거 정상 결제 = 같은 가맹점 · 같은 고객의 매입 완료. 다른 가맹점 결제나 보류 · 거절 결제만 있으면 첫 손님으로 본다
    @Test
    void 과거정상결제여부_같은가맹점CAPTURED만_true() {
        String customer = "c-" + UUID.randomUUID();
        save(captured(2002L, customer));
        save(held(2001L, customer));
        save(declined(2001L, customer));
        Long target = save(Payment.pending(2001L, customer, "T-" + UUID.randomUUID(), 30_000L, Instant.now()));

        assertThat(creation.features(target).hasPriorCapturedPayment()).isFalse();

        save(captured(2001L, customer));
        assertThat(creation.features(target).hasPriorCapturedPayment()).isTrue();
    }

    // R04: 10분 안 3번째 시도(이번 포함)면 +30, 20분 전 시도는 세지 않는다 (#98 F-8)
    @Test
    void R04_10분안3번째시도30점_10분지난시도안셈() {
        String customer = "c-" + UUID.randomUUID();
        Instant now = Instant.now();
        save(attempt(3001L, customer, "fp-" + UUID.randomUUID(), now.minusSeconds(20 * 60)));
        save(attempt(3001L, customer, "fp-" + UUID.randomUUID(), now.minusSeconds(5 * 60)));
        Long second = save(attempt(3001L, customer, "fp-" + UUID.randomUUID(), now.minusSeconds(2 * 60)));
        Long target = save(attempt(3001L, customer, "fp-" + UUID.randomUUID(), now));

        flow.authorizeReady(target);

        assertThat(matched(target)).contains("RAPID_REPEAT");
        assertThat(observed(target, "RAPID_REPEAT")).contains("결제 시도 3번");
        // 2분 전 결제만 보면 10분 안 시도는 2번(20분 전 제외) — 아직 걸리지 않는다
        assertThat(creation.features(second).recentCustomerAttempts()).isEqualTo(2);
    }

    // R08: 같은 카드가 10분 안에 카드사 거절 2번 뒤 또 시도하면 +35 (#98 F-8)
    @Test
    void R08_같은카드10분거절2번뒤재시도_35점() {
        String fingerprint = "fp-" + UUID.randomUUID();
        Instant now = Instant.now();
        save(declined(attempt(3002L, "c-" + UUID.randomUUID(), fingerprint, now.minusSeconds(6 * 60))));
        save(declined(attempt(3002L, "c-" + UUID.randomUUID(), fingerprint, now.minusSeconds(3 * 60))));
        Long target = save(attempt(3002L, "c-" + UUID.randomUUID(), fingerprint, now));

        flow.authorizeReady(target);

        assertThat(matched(target)).contains("DECLINE_RETRY");
        assertThat(observed(target, "DECLINE_RETRY")).contains("카드사 거절 2번");
    }

    // 결제창에서 카드를 붙인 결제 (= 시도)
    private static Payment attempt(long merchantId, String customer, String fingerprint, Instant createdAt) {
        Payment payment = Payment.pending(merchantId, customer, "T-" + UUID.randomUUID(), 12_000L, createdAt);
        payment.attachCheckout("10.99.0.1", null, fingerprint, "9999", "KR");
        return payment;
    }

    private static Payment declined(Payment payment) {
        payment.declineAuthorization("LOST_OR_STOLEN");
        return payment;
    }

    private java.util.List<String> matched(Long paymentId) {
        return evaluations.latestForPayment(paymentId).orElseThrow().matchedRuleCodes();
    }

    private String observed(Long paymentId, String ruleCode) {
        return jdbc.queryForObject(
                "SELECT h.observed_value FROM fds_rule_hits h JOIN fds_evaluations e ON e.evaluation_id = h.evaluation_id"
                        + " WHERE e.payment_id = ? AND h.rule_code = ?",
                String.class,
                paymentId,
                ruleCode);
    }

    private Long save(Payment payment) {
        return payments.save(payment).getPaymentId();
    }

    private static Payment captured(long merchantId, String customer) {
        Payment payment = Payment.pending(merchantId, customer, "T-" + UUID.randomUUID(), 40_000L, Instant.now());
        payment.recordAuthorizationSuccess("AUTH-" + UUID.randomUUID(), false);
        payment.completeCapture();
        return payment;
    }

    private static Payment held(long merchantId, String customer) {
        Payment payment = Payment.pending(merchantId, customer, "T-" + UUID.randomUUID(), 40_000L, Instant.now());
        payment.recordAuthorizationSuccess("AUTH-" + UUID.randomUUID(), true);
        return payment;
    }

    private static Payment declined(long merchantId, String customer) {
        Payment payment = Payment.pending(merchantId, customer, "T-" + UUID.randomUUID(), 40_000L, Instant.now());
        payment.declineAuthorization();
        return payment;
    }
}
