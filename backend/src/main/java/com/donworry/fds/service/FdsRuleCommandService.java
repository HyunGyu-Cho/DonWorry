package com.donworry.fds.service;

import com.donworry.fds.api.FdsRuleEnabled;
import com.donworry.fds.api.FdsRuleSwitch;
import com.donworry.fds.api.TargetChange;
import com.donworry.fds.dto.FdsRuleResponse;
import com.donworry.fds.entity.FdsRule;
import com.donworry.fds.repository.FdsRuleRepository;
import com.donworry.identity.api.CurrentUser;
import java.time.Instant;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Rule 켜기 · 끄기 (#104 2-7) — 켜기는 탐지를 강하게 하는 쪽이라 승인 없이 바로, 끄기는 관리자 승인 뒤 investigation이 부른다
// 평가는 결제마다 fds_rules를 새로 읽으므로 바꾼 다음 결제부터 반영된다
@Service
@RequiredArgsConstructor
public class FdsRuleCommandService implements FdsRuleSwitch {

    static final Set<String> STAFF_ROLES = Set.of("SECURITY_STAFF", "SECURITY_MANAGER");

    private final FdsRuleRepository ruleRepository;
    private final CurrentUser currentUser;
    private final ApplicationEventPublisher events;

    // 검사 순서: 로그인 → 보안 직원 · 관리자인가 → 있는 Rule인가 → 켜고 끌 수 있는 Rule인가 → 이미 켜졌나
    @Transactional
    public FdsRuleResponse.Rule enable(Long ruleId) {
        var user = currentUser.get().orElseThrow(() -> new FdsException(FdsErrorCode.LOGIN_REQUIRED));
        if (!STAFF_ROLES.contains(user.role())) {
            throw new FdsException(FdsErrorCode.RULE_FORBIDDEN);
        }
        FdsRule rule = ruleRepository
                .findByIdForUpdate(ruleId)
                .filter(r -> r.getRetiredAt() == null)
                .orElseThrow(() -> new FdsException(FdsErrorCode.RULE_NOT_FOUND));
        if (!rule.isToggleable()) {
            throw new FdsException(FdsErrorCode.RULE_FORBIDDEN);
        }
        if (rule.isEnabled()) {
            throw new FdsException(FdsErrorCode.RULE_ALREADY_ENABLED);
        }
        Instant now = Instant.now();
        rule.enable(user.userId(), now);
        events.publishEvent(
                new FdsRuleEnabled(rule.getRuleId(), rule.getRuleCode(), user.userId(), rule.getUpdatedAt()));
        return FdsRuleQueryService.rule(rule);
    }

    @Override
    @Transactional(readOnly = true)
    public RuleState state(Long ruleId) {
        return ruleRepository
                .findById(ruleId)
                .map(FdsRuleCommandService::stateOf)
                .orElse(RuleState.MISSING);
    }

    @Override
    @Transactional
    public TargetChange disable(Long ruleId, Long approvedBy) {
        var found = ruleRepository.findByIdForUpdate(ruleId);
        RuleState state = found.map(FdsRuleCommandService::stateOf).orElse(RuleState.MISSING);
        return switch (state) {
            case ON -> {
                found.get().disable(approvedBy, Instant.now());
                yield TargetChange.CHANGED;
            }
            case OFF -> TargetChange.ALREADY_DONE;
            case MISSING, LOCKED -> TargetChange.UNAVAILABLE;
        };
    }

    private static RuleState stateOf(FdsRule rule) {
        if (rule.getRetiredAt() != null) {
            return RuleState.MISSING;
        }
        if (!rule.isToggleable()) {
            return RuleState.LOCKED;
        }
        return rule.isEnabled() ? RuleState.ON : RuleState.OFF;
    }
}
