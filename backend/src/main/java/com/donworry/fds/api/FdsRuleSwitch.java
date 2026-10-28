package com.donworry.fds.api;

// Rule 끄기를 반영하는 공개 경계 (#104 2-7) — investigation 관리자 승인이 부른다. 켜기는 fds 화면 API가 바로 한다
public interface FdsRuleSwitch {

    // 끄기 요청을 받기 전 대상 확인
    RuleState state(Long ruleId);

    // 승인한 관리자 이름으로 끈다 (fds_rules.updated_by). 다음 결제 평가부터 빠진다
    TargetChange disable(Long ruleId, Long approvedBy);

    // MISSING 없음 · 폐지, LOCKED 끌 수 없는 Rule(R07 차단 목록 · 직원 Rule)
    enum RuleState {
        MISSING,
        LOCKED,
        ON,
        OFF
    }
}
