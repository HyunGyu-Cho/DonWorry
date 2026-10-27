package com.donworry.payment.service;

// cardFingerprint: 결제창에서 고른 카드 (모의 카드사가 거절 카드를 알아본다). 결제창 밖 결제면 null
record AuthorizationCommand(Long paymentId, Long amount, String cardFingerprint) {

    AuthorizationCommand(Long paymentId, Long amount) {
        this(paymentId, amount, null);
    }

    AuthorizationCommand {
        if (paymentId == null || paymentId <= 0 || amount == null || amount <= 0) {
            throw new IllegalArgumentException("paymentId and amount must be positive");
        }
    }
}
