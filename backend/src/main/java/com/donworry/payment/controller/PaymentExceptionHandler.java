package com.donworry.payment.controller;

import com.donworry.payment.service.PaymentException;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// 공통 처리기 위치가 정해지기 전까지 payment 컨트롤러 범위에서만 처리한다 (02-code 3절 보류)
@RestControllerAdvice(basePackages = "com.donworry.payment.controller")
public class PaymentExceptionHandler {

    @ExceptionHandler(PaymentException.class)
    public ProblemDetail paymentFailed(PaymentException exception) {
        var code = exception.getErrorCode();
        var problem = ProblemDetail.forStatusAndDetail(code.getStatus(), code.getMessage());
        problem.setProperty("code", code.getCode());
        return problem;
    }
}
