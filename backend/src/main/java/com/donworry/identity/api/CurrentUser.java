package com.donworry.identity.api;

import java.util.Optional;

// 지금 로그인한 사용자를 읽는 공개 경계 (#86) — 사장님 화면이 "우리 가게 것만" 거를 때
// 로그인하지 않았으면 빈 값. 권한 막기(인가)는 로그인 권한 작업에서
public interface CurrentUser {

    Optional<UserView> get();

    // merchantId: 사장님(가맹점 계정)만 있고, 보안 직원은 null
    record UserView(Long userId, String role, Long merchantId) {}
}
