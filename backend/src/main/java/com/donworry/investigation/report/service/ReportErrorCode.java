package com.donworry.investigation.report.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

// P4 보고서 오류 코드 — 화면 api/report.ts와 같은 RPT_ 번호 (공통 ErrorCode 위치가 정해지기 전까지 모듈 안, 02-code 3절)
@Getter
@RequiredArgsConstructor
public enum ReportErrorCode {
    REPORT_NOT_FOUND("RPT_001", "보고서가 없습니다.", HttpStatus.NOT_FOUND),
    // 증거 조회 창구 (2-19)
    TOOL_NOT_FOUND("RPT_002", "없는 조사 도구입니다.", HttpStatus.NOT_FOUND),
    NOT_CURRENT_ATTEMPT("RPT_003", "조사 중인 현재 시도가 아닙니다.", HttpStatus.CONFLICT),
    PAYMENT_NOT_IN_CASE("RPT_004", "이 사건의 결제가 아닙니다.", HttpStatus.BAD_REQUEST),
    // 최신 보고서가 실패가 아니거나 (조사 중 · 완료) 사건이 종료됨 (2-19e)
    RETRY_NOT_ALLOWED("RPT_005", "AI 조사를 다시 할 수 없는 상태입니다.", HttpStatus.CONFLICT);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
