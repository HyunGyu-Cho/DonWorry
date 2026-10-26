package com.donworry.investigation.report.service;

import lombok.Getter;

// 보고서 조회 실패 — report 컨트롤러 범위의 처리기가 ProblemDetail로 바꾼다
@Getter
public class ReportException extends RuntimeException {

    private final ReportErrorCode errorCode;

    public ReportException(ReportErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }
}
