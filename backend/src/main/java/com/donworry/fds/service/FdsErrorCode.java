package com.donworry.fds.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

// fds 화면 API 오류 (#104 2-7) — 공통 ErrorCode 위치가 정해지기 전까지 모듈 안에 둔다 (02-code 3절 보류)
// FDS_010 · FDS_011은 화면 계약(api/fdsRules.ts)에 미리 정한 번호
@Getter
@RequiredArgsConstructor
public enum FdsErrorCode {
    RULE_FORBIDDEN("FDS_010", "Rule을 켤 권한이 없습니다. 보안 직원 · 보안 관리자가 결제 Rule만 켤 수 있습니다.", HttpStatus.FORBIDDEN),
    RULE_ALREADY_ENABLED("FDS_011", "이미 켜져 있는 Rule입니다.", HttpStatus.CONFLICT),
    RULE_NOT_FOUND("FDS_012", "Rule이 없습니다.", HttpStatus.NOT_FOUND),
    LOGIN_REQUIRED("FDS_013", "로그인이 필요합니다.", HttpStatus.UNAUTHORIZED);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
