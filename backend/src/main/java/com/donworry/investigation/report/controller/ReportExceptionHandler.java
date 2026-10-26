package com.donworry.investigation.report.controller;

import com.donworry.investigation.report.service.ReportException;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// 공통 처리기 위치가 정해지기 전까지 report 컨트롤러 범위에서만 처리한다 (02-code 3절 보류)
@RestControllerAdvice(basePackages = "com.donworry.investigation.report.controller")
public class ReportExceptionHandler {

    @ExceptionHandler(ReportException.class)
    public ProblemDetail reportFailed(ReportException exception) {
        var code = exception.getErrorCode();
        var problem = ProblemDetail.forStatusAndDetail(code.getStatus(), code.getMessage());
        problem.setProperty("code", code.getCode());
        return problem;
    }
}
