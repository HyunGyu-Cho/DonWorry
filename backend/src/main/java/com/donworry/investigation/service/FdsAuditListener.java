package com.donworry.investigation.service;

import com.donworry.fds.api.FdsRuleEnabled;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

// Rule 다시 켜기 → 감사 로그 (#104 2-7). fds는 investigation을 부르지 않아 이벤트로 받는다 (Rule 저장 커밋 뒤)
@Component
@RequiredArgsConstructor
@Slf4j
class FdsAuditListener {

    static final String TARGET = "FDS_RULE";

    private final AuditTrail auditTrail;

    @TransactionalEventListener
    void on(FdsRuleEnabled event) {
        // 감사 로그가 실패해도 켜기 응답은 그대로 둔다 (Rule은 이미 켜짐)
        try {
            auditTrail.staffAfterCommit(
                    event.enabledBy(),
                    "RULE_ENABLED",
                    TARGET,
                    event.ruleId(),
                    Map.of("rule", event.ruleCode()),
                    AuditTrail.requestIp(),
                    event.enabledAt());
        } catch (RuntimeException exception) {
            log.error("Rule 켜기 감사 로그 저장 실패 ruleId={}", event.ruleId(), exception);
        }
    }
}
