package com.donworry.fds.service;

import com.donworry.fds.api.FdsEvaluationRequest;
import com.donworry.fds.api.FdsRuleHitOutcome;
import com.donworry.fds.entity.FdsRule;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// 결제 Rule 계산 — R01 고액 · R02 새 기기 · R03 새 카드 · R04 반복 결제 · R05 고위험 국가 IP · R06 카드 테스팅
// · R08 거절 후 재시도 (#96 · #98). 시간 창 기록은 P5가 세어 넘긴다 (P2는 payments를 읽지 않음). R07 차단 목록은 F-10
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
                case "NEW_DEVICE" -> hits.add(newDevice(rule, request));
                case "NEW_CARD" -> hits.add(newCard(rule, request));
                case "HIGH_RISK_COUNTRY_IP" -> hits.add(highRiskCountry(rule, request));
                case "RAPID_REPEAT" -> hits.add(rapidRepeat(rule, request));
                case "DECLINE_RETRY" -> hits.add(declineRetry(rule, request));
                case "CARD_TESTING" -> hits.add(cardTesting(rule, request));
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

    // R02: 과거 정상 결제가 있는 고객이 이 기기로 매입까지 끝낸 결제가 0건 (#98)
    private static Hit newDevice(FdsRule rule, FdsEvaluationRequest request) {
        Hit noHistory = noHistory(rule, request);
        if (noHistory != null) {
            return noHistory;
        }
        Integer completed = request.deviceCompletedPayments();
        if (request.deviceId() == null || completed == null) {
            return unavailable(rule, "기기 정보 없음");
        }
        return hit(
                rule, completed == 0, rule.getScore(), json("completed", completed, "이 기기로 완료한 결제 " + completed + "건"));
    }

    // R03: 과거 정상 결제가 있는 고객이 이 카드로 매입까지 끝낸 결제가 0건 (#98)
    private static Hit newCard(FdsRule rule, FdsEvaluationRequest request) {
        Hit noHistory = noHistory(rule, request);
        if (noHistory != null) {
            return noHistory;
        }
        Integer completed = request.cardCompletedPayments();
        if (completed == null) {
            return unavailable(rule, "카드 정보 없음");
        }
        return hit(
                rule, completed == 0, rule.getScore(), json("completed", completed, "이 카드로 완료한 결제 " + completed + "건"));
    }

    // R05: 접속 IP의 나라가 기준값 countries 목록에 있으면 +40 (#98 F-6). 이름표에 없는 IP는 안전으로 치지 않는다
    private static Hit highRiskCountry(FdsRule rule, FdsEvaluationRequest request) {
        String country = request.clientCountry();
        if (country == null) {
            return unavailable(rule, "접속 위치 확인 불가 (IP 이름표에 없음)");
        }
        Object listed = threshold(rule).get("countries");
        boolean matched = listed instanceof List<?> countries && countries.contains(country);
        String text = countryName(country) + " IP" + (isAnonymous(request) ? " (VPN · Tor)" : "");
        return hit(rule, matched, rule.getScore(), jsonText("country", country, text));
    }

    // R04: 같은 가맹점 · 같은 구매자가 기간 안에 기준 횟수 이상 시도(이번 포함)하면 +30 (#98 F-8)
    private static Hit rapidRepeat(FdsRule rule, FdsEvaluationRequest request) {
        Integer attempts = request.recentCustomerAttempts();
        if (attempts == null) {
            return unavailable(rule, "최근 결제 기록 모름");
        }
        long min = number(threshold(rule).getOrDefault("minAttempts", 3));
        String text = windowText(rule, 10) + " 안 결제 시도 " + attempts + "번 (이번 포함)";
        return hit(rule, attempts >= min, rule.getScore(), json("attempts", attempts, text));
    }

    // R08: 같은 카드가 기간 안에 기준 횟수 이상 카드사 거절된 뒤 또 시도하면 +35 (#98 F-8)
    private static Hit declineRetry(FdsRule rule, FdsEvaluationRequest request) {
        Integer declines = request.recentCardDeclines();
        if (request.cardFingerprint() == null || declines == null) {
            return unavailable(rule, "카드 정보 없음");
        }
        long min = number(threshold(rule).getOrDefault("minDeclines", 2));
        String text = "이 카드 " + windowText(rule, 10) + " 안 카드사 거절 " + declines + "번";
        return hit(rule, declines >= min, rule.getScore(), json("declines", declines, text));
    }

    // R06: 같은 IP에서 기간 안에 서로 다른 카드를 기준 장수 이상 쓰면(이번 · 거절 · 차단 포함) +45 (#98 F-9)
    private static Hit cardTesting(FdsRule rule, FdsEvaluationRequest request) {
        Integer cards = request.recentIpCards();
        if (request.clientIp() == null || cards == null) {
            return unavailable(rule, "접속 IP 모름");
        }
        long min = number(threshold(rule).getOrDefault("minCards", 3));
        String text = "같은 접속 " + windowText(rule, 60) + " 안 카드 " + cards + "장 (이번 포함)";
        return hit(rule, cards >= min, rule.getScore(), json("cards", cards, text));
    }

    // 기준값 windowMinutes → "10분" · "1시간"
    private static String windowText(FdsRule rule, long fallback) {
        long minutes = number(threshold(rule).getOrDefault("windowMinutes", fallback));
        return minutes % 60 == 0 ? (minutes / 60) + "시간" : minutes + "분";
    }

    private static boolean isAnonymous(FdsEvaluationRequest request) {
        return "ANONYMOUS".equals(request.clientIpType());
    }

    // 화면 · AI 보고서에 보일 나라 이름. 모르는 코드는 그대로
    static String countryName(String code) {
        return switch (code) {
            case "KR" -> "한국";
            case "NL" -> "네덜란드";
            case "RU" -> "러시아";
            case "VN" -> "베트남";
            case "DE" -> "독일";
            case "GB" -> "영국";
            case "US" -> "미국";
            default -> code;
        };
    }

    // 과거 정상 결제가 없으면 "평소"가 없어 새 기기 · 새 카드를 판단하지 않는다 — 안전하다는 뜻이 아니다
    private static Hit noHistory(FdsRule rule, FdsEvaluationRequest request) {
        if (request.hasPriorCapturedPayment() == null) {
            return unavailable(rule, "과거 결제 이력 모름");
        }
        if (!request.hasPriorCapturedPayment()) {
            return unavailable(rule, "비교할 과거 정상 결제 없음");
        }
        return null;
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

    private static String jsonText(String key, String value, String text) {
        return "{\"" + key + "\":\"" + escape(value) + "\",\"text\":\"" + escape(text) + "\"}";
    }

    private static String text(String text) {
        return "{\"text\":\"" + escape(text) + "\"}";
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
