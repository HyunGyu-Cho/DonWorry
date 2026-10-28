package com.donworry.fds.api;

import java.time.Instant;

// 직원이 Rule을 다시 켰다 (#104 2-7) — investigation이 받아 감사 로그에 남긴다 (fds는 investigation을 부르지 않는다)
public record FdsRuleEnabled(Long ruleId, String ruleCode, Long enabledBy, Instant enabledAt) {}
