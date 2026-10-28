package com.donworry.investigation.service;

import com.donworry.identity.api.IpLocator;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.entity.Decision;
import com.donworry.investigation.entity.PaymentDecision;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.PaymentDecisionRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.api.PaymentLookup.SharedValue;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 비슷한 과거 사건 (#104 2-9a) — 판정이 끝난 결제 사건 중 같은 대상(카드 · 기기 · IP · 이메일 · 고객)이 겹치거나 적중 Rule 조합이 같은 것
// AI 증거 창구 find_similar_cases와 보고서 "비슷한 과거 사건" 칸이 쓴다. 참고 근거일 뿐 자동 판정에 쓰지 않는다
// 카드 지문 · 원래 값은 P5 안에서만 비교하고 여기로 오지 않는다
@Service
@RequiredArgsConstructor
public class SimilarCaseService {

    static final Duration WINDOW = Duration.ofDays(90);
    static final int LIMIT = 5;
    // Rule 하나만 같은 것은 흔해서 근거가 되지 않는다 — 2개 이상이 완전히 같을 때만 약한 근거
    static final int MIN_RULES_FOR_COMBO = 2;
    static final String OFFICE = "OFFICE";

    private final SecurityCaseRepository securityCaseRepository;
    private final CasePaymentRepository casePaymentRepository;
    private final PaymentDecisionRepository paymentDecisionRepository;
    private final PaymentInfoReader paymentInfoReader;
    private final PaymentLookup paymentLookup;
    private final IpLocator ipLocator;

    // 화면 types/report.ts SimilarCase와 같은 모양 — strength: STRONG 같은 대상이 겹침 · WEAK Rule 조합만 같음
    public record SimilarCase(
            Long caseId,
            String caseType,
            String title,
            Instant occurredAt,
            String outcome,
            String outcomeLabel,
            List<String> matches,
            String strength) {

        public boolean strong() {
            return "STRONG".equals(strength);
        }

        public Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("caseId", String.valueOf(caseId));
            map.put("caseType", caseType);
            map.put("title", title);
            map.put("occurredAt", occurredAt.toString());
            map.put("outcome", outcome);
            map.put("outcomeLabel", outcomeLabel);
            map.put("matches", matches);
            map.put("strength", strength);
            return map;
        }
    }

    private record Candidate(SecurityCase securityCase, List<Long> paymentIds, List<PaymentDecision> decisions) {}

    // 최근 90일 · 최대 5건, 강한 근거 먼저 · 그 안에서 최근 사건 먼저. 지금 사건 · 판정이 안 끝난 사건은 뺀다
    @Transactional(readOnly = true)
    public List<SimilarCase> find(Long caseId) {
        Optional<SecurityCase> current = securityCaseRepository.findById(caseId);
        if (current.isEmpty() || current.get().getCaseType() != CaseType.PAYMENT_FRAUD) {
            return List.of();
        }
        List<Long> currentPayments = paymentIds(caseId);
        if (currentPayments.isEmpty()) {
            return List.of();
        }
        List<Candidate> candidates = decidedCases(caseId, Instant.now().minus(WINDOW));
        if (candidates.isEmpty()) {
            return List.of();
        }
        List<Long> candidatePayments =
                candidates.stream().flatMap(c -> c.paymentIds().stream()).toList();
        Map<Long, Set<SharedValue>> shared = sharedValues(currentPayments, candidatePayments);
        Set<String> currentRules = matchedRules(currentPayments);

        List<Found> found = new ArrayList<>();
        for (Candidate candidate : candidates) {
            Set<SharedValue> same = EnumSet.noneOf(SharedValue.class);
            candidate.paymentIds().forEach(id -> same.addAll(shared.getOrDefault(id, Set.of())));
            List<String> matches = new ArrayList<>();
            same.forEach(value -> matches.add("SAME_" + value.name()));
            boolean ruleCombo = currentRules.size() >= MIN_RULES_FOR_COMBO
                    && currentRules.equals(matchedRules(candidate.paymentIds()));
            if (ruleCombo) {
                matches.add("RULE_COMBO");
            }
            if (!matches.isEmpty()) {
                found.add(new Found(candidate, List.copyOf(matches), !same.isEmpty()));
            }
        }
        // 제목은 고른 5건만 만든다 (결제 조회가 사건마다 든다)
        return found.stream()
                .sorted(Comparator.comparing(Found::strong)
                        .reversed()
                        .thenComparing(f -> f.candidate().securityCase().getCreatedAt(), Comparator.reverseOrder()))
                .limit(LIMIT)
                .map(this::similar)
                .toList();
    }

    private record Found(Candidate candidate, List<String> matches, boolean strong) {}

    private List<Long> paymentIds(Long caseId) {
        return casePaymentRepository.findBySecurityCaseIdOrderByLinkedAtAsc(caseId).stream()
                .map(CasePayment::getPaymentId)
                .toList();
    }

    // 판정이 끝난 사건 = 사건에 묶인 결제가 모두 판정됨
    private List<Candidate> decidedCases(Long caseId, Instant since) {
        Map<Long, List<PaymentDecision>> byCase = new LinkedHashMap<>();
        for (PaymentDecision decision :
                paymentDecisionRepository.findDecisionsOfOtherCasesSince(CaseType.PAYMENT_FRAUD, caseId, since)) {
            byCase.computeIfAbsent(decision.getCasePayment().getSecurityCase().getId(), id -> new ArrayList<>())
                    .add(decision);
        }
        List<Candidate> candidates = new ArrayList<>();
        byCase.forEach((id, decisions) -> {
            List<Long> payments = paymentIds(id);
            if (!payments.isEmpty() && decisions.size() >= payments.size()) {
                candidates.add(
                        new Candidate(decisions.getFirst().getCasePayment().getSecurityCase(), payments, decisions));
            }
        });
        return candidates;
    }

    // 지금 사건 결제마다 같은 값을 쓴 후보 결제 — 지금 결제의 IP가 사내망이면 같은 IP는 근거에서 뺀다 (직원 PC가 겹칠 뿐)
    private Map<Long, Set<SharedValue>> sharedValues(List<Long> currentPayments, List<Long> candidatePayments) {
        Map<Long, Set<SharedValue>> merged = new LinkedHashMap<>();
        for (Long paymentId : currentPayments) {
            boolean office = paymentLookup
                    .find(paymentId)
                    .map(PaymentLookup.PaymentView::clientIp)
                    .flatMap(ipLocator::locate)
                    .map(location -> OFFICE.equals(location.ipType()))
                    .orElse(false);
            paymentLookup.sharedValues(paymentId, candidatePayments).forEach((other, values) -> {
                Set<SharedValue> kept = EnumSet.copyOf(values);
                if (office) {
                    kept.remove(SharedValue.IP);
                }
                if (!kept.isEmpty()) {
                    merged.computeIfAbsent(other, id -> EnumSet.noneOf(SharedValue.class))
                            .addAll(kept);
                }
            });
        }
        return merged;
    }

    // 사건 결제들의 최신 FDS 평가에서 적중한 Rule 코드 모음
    private Set<String> matchedRules(List<Long> paymentIds) {
        Set<String> rules = new TreeSet<>();
        for (Long paymentId : paymentIds) {
            paymentInfoReader.find(paymentId).map(PaymentInfo::ruleHits).ifPresent(rules::addAll);
        }
        return rules;
    }

    // 결과: 하나라도 승인 취소면 사기(FRAUD), 모두 매입 허용이면 정상(NORMAL)
    private SimilarCase similar(Found found) {
        Candidate candidate = found.candidate();
        PaymentDecision reject = candidate.decisions().stream()
                .filter(d -> d.getDecision() == Decision.REJECT)
                .findFirst()
                .orElse(null);
        boolean fraud = reject != null;
        PaymentDecision shown = fraud ? reject : candidate.decisions().getFirst();
        String outcomeLabel = (fraud ? "승인 취소" : "매입 허용") + reasonSuffix(shown.getReason());
        SecurityCase securityCase = candidate.securityCase();
        return new SimilarCase(
                securityCase.getId(),
                securityCase.getCaseType().name(),
                title(securityCase, candidate.paymentIds()),
                securityCase.getCreatedAt(),
                fraud ? "FRAUD" : "NORMAL",
                outcomeLabel,
                found.matches(),
                found.strong() ? "STRONG" : "WEAK");
    }

    // "김민수 고객 · 단체 행사용 케이크 세트 · 650,000원" — 내부 번호 · 고객 코드는 쓰지 않는다
    private String title(SecurityCase securityCase, List<Long> paymentIds) {
        List<PaymentInfo> payments = new ArrayList<>();
        for (Long paymentId : paymentIds) {
            paymentInfoReader.find(paymentId).ifPresent(payments::add);
        }
        Optional<PaymentInfo> first = payments.stream().findFirst();
        StringBuilder title = new StringBuilder(CaseLabels.subject(securityCase.getCaseType(), first));
        first.map(PaymentInfo::orderTitle)
                .filter(order -> !order.isBlank())
                .ifPresent(order -> title.append(" · ")
                        .append(order)
                        .append(payments.size() > 1 ? " 외 " + (payments.size() - 1) + "건" : ""));
        long total = payments.stream()
                .map(PaymentInfo::amount)
                .filter(amount -> amount != null)
                .mapToLong(Long::longValue)
                .sum();
        if (total > 0) {
            title.append(" · ")
                    .append(NumberFormat.getNumberInstance(Locale.KOREA).format(total))
                    .append("원");
        }
        return title.toString();
    }

    private static String reasonSuffix(String reason) {
        if (reason == null || reason.isBlank()) {
            return "";
        }
        String trimmed = reason.trim();
        return " · " + (trimmed.length() > 40 ? trimmed.substring(0, 40) + "…" : trimmed);
    }
}
