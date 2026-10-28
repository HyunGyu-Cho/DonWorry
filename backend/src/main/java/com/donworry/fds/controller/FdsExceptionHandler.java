package com.donworry.fds.controller;

import com.donworry.fds.service.FdsException;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// fds 화면 API 오류 → { code, detail } (#104 2-7) — 공통 처리기가 정해지기 전까지 모듈 controller 범위만 (02-code 3절 보류)
@RestControllerAdvice(basePackages = "com.donworry.fds.controller")
public class FdsExceptionHandler {

    @ExceptionHandler(FdsException.class)
    public ProblemDetail fdsFailed(FdsException exception) {
        var code = exception.getErrorCode();
        var problem = ProblemDetail.forStatusAndDetail(code.getStatus(), code.getMessage());
        problem.setProperty("code", code.getCode());
        return problem;
    }
}
