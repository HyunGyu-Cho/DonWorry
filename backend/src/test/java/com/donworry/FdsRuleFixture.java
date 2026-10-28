package com.donworry;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

// Rule 켜기 · 끄기 테스트용 결제 Rule 한 줄 (#104) — 평가는 모르는 rule_code를 건너뛰어 점수에 영향이 없다
// 끝나면 retire로 카탈로그에서 뺀다 (시드 Rule 목록을 확인하는 테스트와 겹치지 않게)
public final class FdsRuleFixture {

    private FdsRuleFixture() {}

    public static long create(JdbcTemplate jdbc, boolean enabled) {
        String code = "TEST_"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 20).toUpperCase();
        jdbc.update("""
                INSERT INTO fds_rules (rule_code, target, display_name, criteria, action, score, enabled, created_at, updated_at)
                VALUES (?, 'PAYMENT', ?, '테스트용 Rule', 'SCORE', 0, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
                """, code, "테스트 " + code, enabled);
        return idOf(jdbc, code);
    }

    public static long idOf(JdbcTemplate jdbc, String ruleCode) {
        return jdbc.queryForObject("SELECT rule_id FROM fds_rules WHERE rule_code = ?", Long.class, ruleCode);
    }

    public static void retire(JdbcTemplate jdbc, long... ruleIds) {
        for (long ruleId : ruleIds) {
            jdbc.update(
                    "UPDATE fds_rules SET enabled = FALSE, retired_at = UTC_TIMESTAMP(6) WHERE rule_id = ?", ruleId);
        }
    }
}
