package com.donworry.payment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.api.PaymentLookup.CardUsage;
import com.donworry.payment.api.PaymentLookup.CustomerHistory;
import com.donworry.payment.api.PaymentLookup.PastPayment;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

// AI 증거 창구가 읽는 고객 과거 결제 · 카드 사용 (#90)
@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
class PaymentLookupServiceTests {

    @Autowired
    PaymentLookup paymentLookup;

    @Autowired
    PaymentRepository paymentRepository;

    final Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
    final String customer = "customer-" + UUID.randomUUID();

    // 같은 가게 · 같은 고객 · 이 결제보다 먼저 한 결제만. 요약은 전부로, 목록은 최근 limit건
    // 평균 · 최고 · 카드별 건수는 매입 완료(CAPTURED)만 — FDS와 같은 기준
    @Test
    void customerHistory_earlierPaymentsOfSameCustomer_summaryFromAll() {
        save(customer, 40_000, "fp-usual", "4821", days(-30), "CAPTURED");
        save(customer, 50_000, "fp-usual", "4821", days(-10), "CAPTURED");
        save(customer, 30_000, "fp-old", "5555", days(-8), "CAPTURED");
        save(customer, 900_000, "fp-other", "9999", days(-5), "VOIDED");
        Long current = save(customer, 650_000, "fp-new", "1173", now, "HELD");
        save(customer, 10_000, "fp-usual", "4821", now.plus(Duration.ofMinutes(1)), "CAPTURED");
        save("customer-" + UUID.randomUUID(), 70_000, "fp-usual", "4821", days(-1), "CAPTURED");

        CustomerHistory history = paymentLookup.customerHistory(current, 2).orElseThrow();

        assertThat(history.recent()).extracting(PastPayment::amount).containsExactly(900_000L, 30_000L);
        assertThat(history.recent().get(0).status()).isEqualTo("VOIDED");
        assertThat(history.totalCount()).isEqualTo(4);
        assertThat(history.firstPaymentAt()).isEqualTo(days(-30));
        assertThat(history.capturedCount()).isEqualTo(3);
        assertThat(history.capturedAverageAmount()).isEqualTo(40_000L);
        assertThat(history.capturedMaxAmount()).isEqualTo(50_000L);
        assertThat(history.capturedCountByCard()).isEqualTo(Map.of("4821", 2L, "5555", 1L));
    }

    @Test
    void customerHistory_noEarlierPayments() {
        Long current = save(customer, 650_000, "fp-new", "1173", now, "HELD");

        CustomerHistory history = paymentLookup.customerHistory(current, 10).orElseThrow();

        assertThat(history.recent()).isEmpty();
        assertThat(history.totalCount()).isZero();
        assertThat(history.capturedAverageAmount()).isNull();
        assertThat(history.capturedCountByCard()).isEmpty();
    }

    // 이 결제 전에 이 카드로 매입까지 끝낸 수 — 0이면 처음 쓰는 카드. 카드 지문은 응답에 없다
    @Test
    void cardUsage_countsEarlierCompletedPaymentsWithSameCard() {
        save(customer, 40_000, "fp-usual", "4821", days(-30), "CAPTURED");
        Long newCard = save(customer, 650_000, "fp-new", "1173", now, "HELD");
        Long usualCard = save(customer, 45_000, "fp-usual", "4821", now.plus(Duration.ofMinutes(1)), "HELD");
        save(customer, 45_000, "fp-new", "1173", now.plus(Duration.ofMinutes(2)), "CAPTURED");

        CardUsage first = paymentLookup.cardUsage(newCard).orElseThrow();
        assertThat(first.cardLast4()).isEqualTo("1173");
        assertThat(first.cardCountry()).isEqualTo("KR");
        assertThat(first.completedPaymentsWithCard()).isZero();
        assertThat(first.authorizationRef()).startsWith("AUTH-");
        assertThat(paymentLookup.cardUsage(usualCard).orElseThrow().completedPaymentsWithCard())
                .isEqualTo(1);
        assertThat(CardUsage.class.getRecordComponents())
                .noneMatch(c -> c.getName().contains("ingerprint"));
    }

    private Instant days(int days) {
        return now.plus(Duration.ofDays(days));
    }

    private Long save(String customerRef, long amount, String fingerprint, String last4, Instant at, String status) {
        Payment payment = Payment.ready(
                new Payment.Order(
                        1L, customerRef, "T-" + UUID.randomUUID(), "케이크", amount, "고객", "b@example.com", at, null),
                at);
        payment.attachCheckout("127.0.0.1", "device", fingerprint, last4, "KR");
        payment.recordAuthorizationSuccess("AUTH-" + UUID.randomUUID(), true);
        switch (status) {
            case "CAPTURED" -> {
                payment.releaseHold();
                payment.completeCapture();
            }
            case "VOIDED" -> payment.voidHeld();
            default -> {}
        }
        return paymentRepository.save(payment).getPaymentId();
    }
}
