package com.donworry.identity.api;

import java.time.Instant;

// 로그인 시도가 기록됐다 (#102) — investigation이 받아 감사 로그에 남긴다 (identity는 다른 모듈을 부르지 않는다)
// result: SUCCESS · BAD_PASSWORD · LOCKED · UNKNOWN_USER, lockedNow: 이번 실패로 계정이 잠겼는지
public record StaffLoginRecorded(
        Long userId,
        String loginId,
        String role,
        String result,
        boolean lockedNow,
        String clientIp,
        Instant occurredAt) {}
