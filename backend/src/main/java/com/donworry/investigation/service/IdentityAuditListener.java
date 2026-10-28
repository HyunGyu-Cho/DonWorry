package com.donworry.investigation.service;

import com.donworry.identity.api.StaffLoginRecorded;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

// 직원 로그인 → 감사 로그 (#102). identity는 다른 모듈을 부르지 않아 이벤트로 받는다 (로그인 기록 커밋 뒤)
// 사장님 로그인 · 없는 아이디는 감사 로그가 아니라 로그인 기록(staff_login_events)에만 남는다
@Component
@RequiredArgsConstructor
@Slf4j
class IdentityAuditListener {

    static final Set<String> AUDITED_ROLES = Set.of("SECURITY_STAFF", "SECURITY_MANAGER", "ADMIN");
    static final String TARGET = "PLATFORM_USER";

    private final AuditTrail auditTrail;

    @TransactionalEventListener
    void on(StaffLoginRecorded event) {
        if (event.userId() == null || !AUDITED_ROLES.contains(event.role())) {
            return;
        }
        String action = switch (event.result()) {
            case "SUCCESS" -> "LOGIN_SUCCESS";
            case "BAD_PASSWORD" -> "LOGIN_FAILED";
            case "LOCKED" -> "LOGIN_WHILE_LOCKED";
            default -> null;
        };
        if (action == null) {
            return;
        }
        // 감사 로그가 실패해도 로그인 응답은 그대로 둔다 (로그인 기록은 이미 저장됨)
        try {
            Map<String, Object> detail = Map.of("loginId", event.loginId());
            auditTrail.staffAfterCommit(
                    event.userId(), action, TARGET, event.userId(), detail, event.clientIp(), event.occurredAt());
            if (event.lockedNow()) {
                auditTrail.staffAfterCommit(
                        event.userId(),
                        "ACCOUNT_LOCKED",
                        TARGET,
                        event.userId(),
                        detail,
                        event.clientIp(),
                        event.occurredAt());
            }
        } catch (RuntimeException exception) {
            log.error("로그인 감사 로그 저장 실패 userId={}", event.userId(), exception);
        }
    }
}
