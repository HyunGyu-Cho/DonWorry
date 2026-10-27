package com.donworry.payment.controller;

import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.dto.PaymentContextResponse;
import com.donworry.payment.service.PaymentErrorCode;
import com.donworry.payment.service.PaymentException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 결제 + 구매자 연동 정보 (보안 직원 화면, #82) — 권한 막기는 로그인 권한 작업에서
@RestController
@RequestMapping("/api/payment/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentLookup paymentLookup;

    @GetMapping("/{paymentId}")
    public PaymentContextResponse payment(@PathVariable Long paymentId) {
        return paymentLookup
                .find(paymentId)
                .map(PaymentContextResponse::from)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
    }
}
