package com.donworry.investigation.service;

import com.donworry.identity.api.CurrentUser;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

// 지금 로그인한 직원 확인 (#102) — 판정 · 승인 · 감사 로그가 같은 규칙을 쓴다
@Component
@RequiredArgsConstructor
public class StaffGuard {

    static final String STAFF = "SECURITY_STAFF";
    static final String MANAGER = "SECURITY_MANAGER";
    static final Set<String> STAFF_ROLES = Set.of(STAFF, MANAGER);

    private final CurrentUser currentUser;

    public CurrentUser.UserView requireStaff() {
        var user =
                currentUser.get().orElseThrow(() -> new InvestigationException(InvestigationErrorCode.LOGIN_REQUIRED));
        if (!STAFF_ROLES.contains(user.role())) {
            throw new InvestigationException(InvestigationErrorCode.STAFF_ONLY);
        }
        return user;
    }

    public CurrentUser.UserView requireManager(InvestigationErrorCode whenNotManager) {
        var user =
                currentUser.get().orElseThrow(() -> new InvestigationException(InvestigationErrorCode.LOGIN_REQUIRED));
        if (!MANAGER.equals(user.role())) {
            throw new InvestigationException(whenNotManager);
        }
        return user;
    }
}
