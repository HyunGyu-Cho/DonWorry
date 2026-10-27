package com.donworry.fds.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.entity.FdsRule;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

// 실제 MariaDB에 Flyway 전체를 적용한 뒤 결제 Rule 카탈로그가 룰안(R01~R08)과 같은지 확인한다 (#96, ADR-0023)
@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
@Transactional
class FdsRuleSeedTests {

    @Autowired
    FdsRuleRepository ruleRepository;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void 새시드migration_R01부터R08켜짐_옛룰3개폐지_점수일치() {
        List<FdsRule> payment = ruleRepository.findActiveCatalog().stream()
                .filter(rule -> "PAYMENT".equals(rule.getTarget()))
                .toList();

        assertThat(payment)
                .extracting(FdsRule::getDisplayCode, FdsRule::getRuleCode, FdsRule::getScore, FdsRule::isEnabled)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("R01", "HIGH_AMOUNT", 30, true),
                        org.assertj.core.groups.Tuple.tuple("R02", "NEW_DEVICE", 25, true),
                        org.assertj.core.groups.Tuple.tuple("R03", "NEW_CARD", 25, true),
                        org.assertj.core.groups.Tuple.tuple("R04", "RAPID_REPEAT", 30, true),
                        org.assertj.core.groups.Tuple.tuple("R05", "HIGH_RISK_COUNTRY_IP", 40, true),
                        org.assertj.core.groups.Tuple.tuple("R06", "CARD_TESTING", 45, true),
                        org.assertj.core.groups.Tuple.tuple("R07", "BLOCKLIST", 100, true),
                        org.assertj.core.groups.Tuple.tuple("R08", "DECLINE_RETRY", 35, true));
        assertThat(payment.getFirst().getThreshold()).isEqualTo(Map.of("minAmount", 500000));

        // 폐지한 3개는 행이 남아 있되 꺼져 있고 폐지 시각이 있다 (과거 평가가 rule_code로 가리킴)
        List<Map<String, Object>> retired = jdbcTemplate.queryForList("""
                SELECT rule_code, enabled, retired_at, display_code FROM fds_rules
                WHERE rule_code IN ('AMOUNT_SPIKE', 'NEW_ACCOUNT', 'GEO_MISMATCH')
                """);
        assertThat(retired).hasSize(3).allSatisfy(row -> {
            assertThat(row.get("enabled")).isEqualTo(false);
            assertThat(row.get("retired_at")).isNotNull();
            assertThat(row.get("display_code")).isNull();
        });
    }
}
