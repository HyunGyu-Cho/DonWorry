package com.donworry.investigation.report.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

// P4 보고서 오류 코드 — 화면 api/report.ts와 같은 RPT_ 번호 (공통 ErrorCode 위치가 정해지기 전까지 모듈 안, 02-code 3절)
@Getter
@RequiredArgsConstructor
public enum ReportErrorCode {
    REPORT_NOT_FOUND("RPT_001", "보고서가 없습니다.", HttpStatus.NOT_FOUND);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
