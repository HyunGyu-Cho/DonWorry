package com.donworry.fds.service;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsRuleHitOutcome;
import com.donworry.fds.entity.FdsRule;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// 결제 Rule 계산 — 지금은 R01 고액 결제 · R03 기존 결제 이력 없는 카드. 나머지는 묶음 ② · ③ (#96)
// 기준값 · 점수는 fds_rules에서 읽는다. 판단할 값이 없으면 UNAVAILABLE(0점)로 남긴다 — 점수를 추정하지 않는다
final class PaymentRuleSet {

    private PaymentRuleSet() {}

    // threshold · observed는 fds_rule_hits JSON 칸에 들어간다. text는 화면에 그대로 보일 문장
    record Hit(
            String ruleCode,
            String ruleName,
            FdsRuleHitOutcome outcome,
            int score,
            String threshold,
            String observed) {}

    static List<Hit> evaluate(FdsEvaluationRequest request, List<FdsRule> rules) {
        List<Hit> hits = new ArrayList<>();
        for (FdsRule rule : rules) {
            if (!rule.isEnabled() || rule.getRetiredAt() != null || !"PAYMENT".equals(rule.getTarget())) {
                continue;
            }
            switch (rule.getRuleCode()) {
                case "HIGH_AMOUNT" -> hits.add(highAmount(rule, request.amount()));
                case "NEW_CARD" -> hits.add(newCard(rule, request.cardCompletedPayments()));
                default -> {
                    // 아직 계산하지 않는 Rule (묶음 ② · ③) — 기록 없이 0점
                }
            }
        }
        return hits;
    }

    // R01: 결제 금액이 기준 이상이면 Rule 점수 (50만 원 이상 30점)
    private static Hit highAmount(FdsRule rule, long amount) {
        long minAmount = number(threshold(rule).getOrDefault("minAmount", 500_000));
        return hit(rule, amount >= minAmount, rule.getScore(), json("amount", amount, won(amount)));
    }

    // 이 고객이 이 카드로 매입까지 끝낸 결제가 0건
    private static Hit newCard(FdsRule rule, Integer completed) {
        if (completed == null) {
            return unavailable(rule, "카드 정보 없음");
        }
        return hit(
                rule, completed == 0, rule.getScore(), json("completed", completed, "이 카드로 완료한 결제 " + completed + "건"));
    }

    private static Hit hit(FdsRule rule, boolean matched, int score, String observed) {
        return new Hit(
                rule.getRuleCode(),
                rule.getDisplayName(),
                matched ? FdsRuleHitOutcome.MATCH : FdsRuleHitOutcome.NO_MATCH,
                matched ? score : 0,
                text(rule.getCriteria()),
                observed);
    }

    private static Hit unavailable(FdsRule rule, String reason) {
        return new Hit(
                rule.getRuleCode(),
                rule.getDisplayName(),
                FdsRuleHitOutcome.UNAVAILABLE,
                0,
                text(rule.getCriteria()),
                text(reason));
    }

    private static Map<String, Object> threshold(FdsRule rule) {
        return rule.getThreshold() == null ? Map.of() : rule.getThreshold();
    }

    private static long number(Object value) {
        return value instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(value));
    }

    // 650000 → "65만 원", 38500 → "38,500원"
    static String won(long amount) {
        if (amount % 10_000 == 0) {
            return NumberFormat.getIntegerInstance(Locale.KOREA).format(amount / 10_000) + "만 원";
        }
        return NumberFormat.getIntegerInstance(Locale.KOREA).format(amount) + "원";
    }

    private static String json(String key, long value, String text) {
        return "{\"" + key + "\":" + value + ",\"text\":\"" + escape(text) + "\"}";
    }

    private static String text(String text) {
        return "{\"text\":\"" + escape(text) + "\"}";
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
