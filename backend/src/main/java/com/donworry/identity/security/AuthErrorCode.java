package com.donworry.identity.security;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode {
    AUTHENTICATION_REQUIRED("AUTH_001", "로그인이 필요합니다.", HttpStatus.UNAUTHORIZED),
    ACCESS_DENIED("AUTH_002", "권한이 없습니다.", HttpStatus.FORBIDDEN),
    INVALID_CREDENTIALS("AUTH_004", "아이디 또는 비밀번호가 올바르지 않습니다.", HttpStatus.UNAUTHORIZED),
    AUTHENTICATION_UNAVAILABLE("AUTH_005", "로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", HttpStatus.INTERNAL_SERVER_ERROR),
    // 화면 계약(api/identity.ts)에 미리 정한 번호 (#102). 재인증은 1차 MVP에서 비밀번호로 한다 — 401이면 화면이 로그아웃시키므로 400
    INVALID_REAUTH("AUTH_010", "비밀번호가 올바르지 않습니다.", HttpStatus.BAD_REQUEST),
    ACCOUNT_LOCKED("AUTH_011", "비밀번호를 5번 연속 틀려 30분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요.", HttpStatus.LOCKED);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
