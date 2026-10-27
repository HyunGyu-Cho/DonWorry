package com.donworry.fds.service;

import com.donworry.fds.api.FdsCountWindows;
import com.donworry.fds.entity.FdsRule;
import com.donworry.fds.repository.FdsRuleRepository;
import java.time.Duration;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// fds_rules 기준값의 windowMinutes를 읽는다 (#98 F-8). 값이 없으면 룰안 기본값 (10분 · 10분 · 60분)
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FdsCountWindowService implements FdsCountWindows {

    private final FdsRuleRepository ruleRepository;

    @Override
    public Windows current() {
        List<FdsRule> rules = ruleRepository.findActiveCatalog();
        return new Windows(
                minutes(rules, "RAPID_REPEAT", 10),
                minutes(rules, "DECLINE_RETRY", 10),
                minutes(rules, "CARD_TESTING", 60));
    }

    private static Duration minutes(List<FdsRule> rules, String code, long fallback) {
        return rules.stream()
                .filter(rule -> code.equals(rule.getRuleCode()) && rule.getThreshold() != null)
                .map(rule -> rule.getThreshold().get("windowMinutes"))
                .filter(Number.class::isInstance)
                .map(value -> Duration.ofMinutes(((Number) value).longValue()))
                .findFirst()
                .orElse(Duration.ofMinutes(fallback));
    }
}
