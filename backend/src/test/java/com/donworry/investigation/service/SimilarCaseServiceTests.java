package com.donworry.investigation.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.HeldPaymentFixture;
import com.donworry.HeldPaymentFixture.Checkout;
import com.donworry.MariaDbTestContainerConfig;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.entity.Decision;
import com.donworry.investigation.entity.PaymentDecision;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.PaymentDecisionRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.SimilarCaseService.SimilarCase;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

// 비슷한 과거 사건 찾기 (#104 2-9a) — 실제 MariaDB에 결제 · 사건 · 판정을 만들어 확인한다
// 다른 테스트 사건과 겹치지 않게 값(카드 · 기기 · IP · 이메일 · 고객)과 Rule 코드를 테스트마다 새로 만든다
@Tag("mariadb")
@SpringBootTest
@Import({MariaDbTestContainerConfig.class, HeldPaymentFixture.class})
class SimilarCaseServiceTests {

    static final long MERCHANT = 1L;
    static final long OTHER_MERCHANT = 2L;
    // 시드 demo_fake_ips의 사내망(OFFICE) IP
    static final String OFFICE_IP = "10.20.0.15";

    @Autowired
    SimilarCaseService similarCaseService;

    @Autowired
    HeldPaymentFixture fixture;

    @Autowired
    SecurityCaseRepository securityCaseRepository;

    @Autowired
    CasePaymentRepository casePaymentRepository;

    @Autowired
    PaymentDecisionRepository paymentDecisionRepository;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void 비슷한사건_같은카드_기기_IP_이메일_고객으로찾고_판정결과_근거종류를돌려줌_카드지문은안나감() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String customer = "sim-" + tag;
        String card = "fp-" + tag;
        String device = "dev-" + tag;
        String ip = "203.0.113." + (Math.abs(tag.hashCode()) % 200 + 1);
        String email = "sim-" + tag + "@example.com";
        List<String> rules = List.of("T6A_" + tag, "T6B_" + tag);
        long current = caseOf(
                fixture.payment(MERCHANT, customer, 650_000, 70, rules, new Checkout(email, ip, device, card)),
                customer,
                null);

        long sameCard = decided(other(new Checkout(null, null, null, card)), Decision.REJECT, "카드 도용 확인");
        long sameDevice = decided(other(new Checkout(null, null, device, "fp-x-" + tag)), Decision.ACCEPT, "본인 결제");
        long sameIpAndEmail =
                decided(other(new Checkout(email.toUpperCase(), ip, null, "fp-y-" + tag)), Decision.REJECT, "도용");
        long sameCustomer = decided(
                fixture.payment(MERCHANT, customer, 40_000, 10, List.of(), new Checkout(null, null, null, null)),
                Decision.ACCEPT,
                "정상");
        // 같은 고객 코드라도 다른 가맹점이면 같은 고객이 아니다
        long otherShop = decided(
                fixture.payment(OTHER_MERCHANT, customer, 40_000, 10, List.of(), new Checkout(null, null, null, null)),
                Decision.ACCEPT,
                "정상");

        List<SimilarCase> found = similarCaseService.find(current);
        Map<Long, SimilarCase> byCase =
                found.stream().collect(Collectors.toMap(SimilarCase::caseId, Function.identity()));

        assertThat(byCase.get(sameCard).matches()).containsExactly("SAME_CARD");
        assertThat(byCase.get(sameCard).outcome()).isEqualTo("FRAUD");
        assertThat(byCase.get(sameCard).outcomeLabel()).isEqualTo("승인 취소 · 카드 도용 확인");
        assertThat(byCase.get(sameDevice).matches()).containsExactly("SAME_DEVICE");
        assertThat(byCase.get(sameDevice).outcome()).isEqualTo("NORMAL");
        assertThat(byCase.get(sameIpAndEmail).matches()).containsExactly("SAME_IP", "SAME_EMAIL");
        assertThat(byCase.get(sameCustomer).matches()).containsExactly("SAME_CUSTOMER");
        assertThat(byCase).doesNotContainKey(otherShop).doesNotContainKey(current);
        assertThat(List.of(sameCard, sameDevice, sameIpAndEmail, sameCustomer))
                .allSatisfy(id -> assertThat(byCase.get(id).strength()).isEqualTo("STRONG"));
        assertThat(byCase.get(sameCard).title()).startsWith("테스트 고객 고객 · 테스트 케이크");
        // 보고서 · AI에 나가는 모양에 카드 지문 · 원래 값이 없다
        assertThat(found.stream().map(SimilarCase::toMap).toList().toString()).doesNotContain(card, device, ip, email);
    }

    @Test
    void 비슷한사건_Rule조합만같으면약한근거_지금사건_판정안된사건_사내망IP는뺌() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String card = "fp-" + tag;
        List<String> rules = List.of("T7A_" + tag, "T7B_" + tag);
        long currentPayment =
                fixture.payment(MERCHANT, "sim-" + tag, 300_000, 60, rules, new Checkout(null, OFFICE_IP, null, card));
        long current = caseOf(currentPayment, "sim-" + tag, null);
        // 지금 사건의 다른 결제는 과거 사건이 아니다
        casePaymentRepository.save(CasePayment.link(
                securityCaseRepository.findById(current).orElseThrow(),
                fixture.payment(MERCHANT, "sim-" + tag, 10_000, 0, List.of(), new Checkout(null, null, null, card)),
                Instant.now()));

        long ruleOnly = decided(
                fixture.payment(MERCHANT, "other-" + tag, 300_000, 60, rules, new Checkout(null, null, null, null)),
                Decision.ACCEPT,
                "정상");
        // Rule 하나만 같으면 근거가 아니다
        long oneRule = decided(
                fixture.payment(
                        MERCHANT,
                        "one-" + tag,
                        300_000,
                        60,
                        List.of(rules.get(0)),
                        new Checkout(null, null, null, null)),
                Decision.REJECT,
                "도용");
        // 판정 전 사건 · 결제 일부만 판정한 사건은 뺀다
        long undecided = caseOf(other(new Checkout(null, null, null, card)), "u-" + tag, null);
        long partial = caseOf(other(new Checkout(null, null, null, card)), "p-" + tag, Decision.REJECT);
        casePaymentRepository.save(CasePayment.link(
                securityCaseRepository.findById(partial).orElseThrow(),
                other(new Checkout(null, null, null, card)),
                Instant.now()));
        // 사내망 IP만 같으면 직원 PC가 겹칠 뿐이라 뺀다
        long officeOnly = decided(other(new Checkout(null, OFFICE_IP, null, "fp-o-" + tag)), Decision.REJECT, "도용");
        // 90일보다 오래된 사건은 뺀다
        long old = decided(other(new Checkout(null, null, null, card)), Decision.REJECT, "도용");
        jdbc.update(
                "UPDATE security_cases SET created_at = UTC_TIMESTAMP(6) - INTERVAL 100 DAY WHERE case_id = ?", old);

        Map<Long, SimilarCase> byCase = similarCaseService.find(current).stream()
                .collect(Collectors.toMap(SimilarCase::caseId, Function.identity()));

        assertThat(byCase.get(ruleOnly).matches()).containsExactly("RULE_COMBO");
        assertThat(byCase.get(ruleOnly).strength()).isEqualTo("WEAK");
        assertThat(byCase.keySet()).doesNotContain(current, oneRule, undecided, partial, officeOnly, old);
    }

    // 다른 고객의 결제 — 겹치는 값은 checkout으로만 정한다
    private long other(Checkout checkout) {
        return fixture.payment(MERCHANT, "o-" + UUID.randomUUID(), 50_000, 20, List.of(), checkout);
    }

    private long decided(long paymentId, Decision decision, String reason) {
        return caseOf(paymentId, "c-" + UUID.randomUUID(), decision, reason);
    }

    private long caseOf(long paymentId, String customerRef, Decision decision) {
        return caseOf(paymentId, customerRef, decision, "테스트 판정");
    }

    // decision이 null이면 판정 전 사건
    private long caseOf(long paymentId, String customerRef, Decision decision, String reason) {
        SecurityCase securityCase = securityCaseRepository.save(
                SecurityCase.open(MERCHANT, customerRef, CaseType.PAYMENT_FRAUD, Instant.now()));
        CasePayment link = casePaymentRepository.save(CasePayment.link(securityCase, paymentId, Instant.now()));
        if (decision != null) {
            paymentDecisionRepository.save(PaymentDecision.confirm(
                    link, 4L, null, decision, reason, securityCase.getEvidenceVersion(), Instant.now()));
        }
        return securityCase.getId();
    }
}
