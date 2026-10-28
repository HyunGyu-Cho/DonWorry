package com.donworry.identity.security;

import org.springframework.security.core.AuthenticationException;

// 비밀번호 연속 실패로 잠긴 계정 (#102) → AUTH_011
public class AccountLockedException extends AuthenticationException {

    public AccountLockedException() {
        super("잠긴 계정입니다.");
    }
}
