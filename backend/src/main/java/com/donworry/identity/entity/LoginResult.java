package com.donworry.identity.entity;

// 로그인 시도 결과 (staff_login_events.result) — BAD_OTP는 2차 MVP(OTP)에서 쓴다
public enum LoginResult {
    SUCCESS,
    BAD_PASSWORD,
    BAD_OTP,
    LOCKED,
    UNKNOWN_USER
}
