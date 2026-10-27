package com.donworry.identity.api;

import java.util.Optional;

// 직원 표시 이름을 읽는 공개 경계 (#82) — 승인 요청 · 감사 로그 화면용
public interface StaffDirectory {

    Optional<String> displayName(Long userId);
}
