package com.donworry.fds.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

// Rule 카탈로그 · 적중 통계 응답 — 화면 types/fds.ts의 FdsRule · RuleHitStat과 같은 모양
public final class FdsRuleResponse {

    private FdsRuleResponse() {}

    public record Rule(
            Long ruleId,
            String ruleCode,
            // 결제 Rule 표시 번호 R01~R08, 직원 Rule은 null (#96)
            String displayCode,
            String target,
            String displayName,
            String criteria,
            String action,
            int score,
            String severity,
            Map<String, Object> threshold,
            boolean enabled,
            Long updatedBy,
            Instant updatedAt) {}

    // daily: 한국 날짜 기준 하루별 적중 수, 오래된 날 → 오늘
    public record HitStat(String ruleCode, List<Integer> daily, int total, Instant lastHitAt) {}
}
