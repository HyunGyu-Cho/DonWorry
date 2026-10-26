package com.donworry.investigation.report.service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

// AI가 쓴 칸을 Spring이 다시 검사한다 — ai-server의 형식 검사를 그대로 믿지 않는다 (ADR-0009 결정 4)
// 특히 결제별 권고의 결제 번호가 정말 그 사건의 결제인지는 Spring만 알 수 있다
final class ReportDraftCheck {

    private ReportDraftCheck() {}

    // 문제가 없으면 빈 값, 있으면 사람이 읽는 이유 (실패 정보에만 남고 화면에는 안 보임)
    static Optional<String> problem(ReportTarget target, Map<String, Object> draft, Set<Long> casePaymentIds) {
        if (draft == null) {
            return Optional.of("보고서 본문 없음");
        }
        if (!target.caseType().equals(draft.get("reportType"))) {
            return Optional.of("사건 종류가 다름 (사건 " + target.caseType() + ", 답 " + draft.get("reportType") + ")");
        }
        if (!(draft.get("riskScore") instanceof Number score) || score.doubleValue() < 0 || score.doubleValue() > 100) {
            return Optional.of("위험도가 0~100이 아님");
        }
        for (String key : List.of("verdict", "summary")) {
            if (!(draft.get(key) instanceof String text) || text.isBlank()) {
                return Optional.of("필수 항목 '" + key + "' 누락");
            }
        }
        for (String key : List.of("recommendations", "riskPoints", "checks")) {
            if (!(draft.get(key) instanceof Collection<?> list) || list.isEmpty()) {
                return Optional.of("필수 항목 '" + key + "' 누락");
            }
        }
        Object advice = draft.get("paymentAdvice");
        if (!"PAYMENT_FRAUD".equals(target.caseType())) {
            return advice == null ? Optional.empty() : Optional.of("결제 사건이 아닌데 결제별 권고가 있음");
        }
        if (!(advice instanceof Collection<?> items) || items.isEmpty()) {
            return Optional.of("필수 항목 'paymentAdvice' 누락");
        }
        for (Object item : items) {
            Long paymentId = item instanceof Map<?, ?> map ? parseId(map.get("paymentId")) : null;
            if (paymentId == null || !casePaymentIds.contains(paymentId)) {
                return Optional.of("사건에 없는 결제 번호가 있음");
            }
        }
        return Optional.empty();
    }

    static Long parseId(Object value) {
        try {
            return value == null ? null : Long.valueOf(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
