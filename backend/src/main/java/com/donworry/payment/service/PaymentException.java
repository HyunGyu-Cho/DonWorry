package com.donworry.payment.service;

import lombok.Getter;

// P5 요청 실패 — payment 컨트롤러 범위의 처리기가 ProblemDetail로 바꾼다
@Getter
public class PaymentException extends RuntimeException {

    private final PaymentErrorCode errorCode;

    public PaymentException(PaymentErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }
}
