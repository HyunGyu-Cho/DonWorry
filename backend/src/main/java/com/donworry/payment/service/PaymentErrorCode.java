package com.donworry.payment.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

// P5 오류 코드 — 화면 api/checkout.ts · api/payment.ts와 같은 PAY_ 번호 (cakeshop-contract 8절)
@Getter
@RequiredArgsConstructor
public enum PaymentErrorCode {
    PAYMENT_NOT_FOUND("PAY_001", "결제가 없습니다.", HttpStatus.NOT_FOUND),
    // 구매자 본인 확인 링크 (0-6)
    CONFIRM_LINK_EXPIRED("PAY_010", "본인 확인 링크가 만료됐거나 없습니다.", HttpStatus.GONE),
    CONFIRM_ALREADY_ANSWERED("PAY_011", "이미 응답한 본인 확인입니다.", HttpStatus.CONFLICT),
    INVALID_ANSWER("PAY_012", "응답은 MINE 또는 NOT_MINE입니다.", HttpStatus.BAD_REQUEST),
    CHECKOUT_EXPIRED("PAY_022", "결제창이 만료됐거나 없습니다.", HttpStatus.GONE),
    CHECKOUT_ALREADY_PAID("PAY_023", "이미 결제한 결제창입니다.", HttpStatus.CONFLICT),
    UNKNOWN_CARD("PAY_025", "없는 시연 카드입니다.", HttpStatus.BAD_REQUEST),
    UNKNOWN_PRODUCT("PAY_026", "없는 테스트 상품입니다.", HttpStatus.BAD_REQUEST),
    // 사장님 화면은 가맹점 계정으로만 (#86)
    MERCHANT_LOGIN_REQUIRED("PAY_030", "가맹점 계정으로 로그인해야 합니다.", HttpStatus.FORBIDDEN);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
