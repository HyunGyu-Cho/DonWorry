package com.donworry.fds.service;

import com.donworry.fds.api.FdsRuleHitOutcome;
import com.donworry.fds.dto.FdsRuleResponse;
import com.donworry.fds.entity.FdsRule;
import com.donworry.fds.repository.FdsEvaluationRepository;
import com.donworry.fds.repository.FdsRuleRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Rule 카탈로그 · 최근 적중 통계 (#82) — 켜기 · 끄기는 2-7
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FdsRuleQueryService {

    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

    private final FdsRuleRepository ruleRepository;
    private final FdsEvaluationRepository evaluationRepository;

    public List<FdsRuleResponse.Rule> rules() {
        return ruleRepository.findAllByOrderByRuleIdAsc().stream()
                .map(FdsRuleQueryService::rule)
                .toList();
    }

    // Rule마다 최근 days일 하루별 적중(MATCH) 수 — 결제 Rule만 (직원 Rule 적중은 2-8)
    public List<FdsRuleResponse.HitStat> hitStats(int days, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, KOREA);
        LocalDate first = today.minusDays(days - 1L);
        Instant from = first.atStartOfDay(KOREA).toInstant();
        Map<String, List<Integer>> daily = new HashMap<>();
        for (Object[] row : evaluationRepository.findMatchedHitTimes(FdsRuleHitOutcome.MATCH, from)) {
            String code = (String) row[0];
            LocalDate day = LocalDate.ofInstant((Instant) row[1], KOREA);
            int index = (int) ChronoUnit.DAYS.between(first, day);
            if (index < 0 || index >= days) {
                continue;
            }
            List<Integer> counts = daily.computeIfAbsent(code, c -> new ArrayList<>(Collections.nCopies(days, 0)));
            counts.set(index, counts.get(index) + 1);
        }
        Map<String, Instant> last = new HashMap<>();
        for (Object[] row : evaluationRepository.findLastHitTimes(FdsRuleHitOutcome.MATCH)) {
            last.put((String) row[0], (Instant) row[1]);
        }
        return ruleRepository.findAllByOrderByRuleIdAsc().stream()
                .filter(rule -> "PAYMENT".equals(rule.getTarget()))
                .map(rule -> {
                    List<Integer> counts =
                            daily.getOrDefault(rule.getRuleCode(), new ArrayList<>(Collections.nCopies(days, 0)));
                    int total = counts.stream().mapToInt(Integer::intValue).sum();
                    return new FdsRuleResponse.HitStat(rule.getRuleCode(), counts, total, last.get(rule.getRuleCode()));
                })
                .toList();
    }

    private static FdsRuleResponse.Rule rule(FdsRule rule) {
        return new FdsRuleResponse.Rule(
                rule.getRuleId(),
                rule.getRuleCode(),
                rule.getTarget(),
                rule.getDisplayName(),
                rule.getCriteria(),
                rule.getAction(),
                rule.getScore(),
                rule.getSeverity(),
                rule.getThreshold(),
                rule.isEnabled(),
                rule.getUpdatedBy(),
                rule.getUpdatedAt());
    }
}
