package com.donworry.payment.service;

import org.springframework.stereotype.Component;

@Component
class MockPaymentAuthorizer implements PaymentAuthorizer {
    @Override
    public AuthorizationResult authorize(AuthorizationCommand command) {
        if (command == null) {
            throw new IllegalArgumentException("command must not be null");
        }
        // 시연 거절 카드는 카드사가 사유와 함께 거절한다 (#82 · #98)
        var declineCode = DemoCard.declineCodeOf(command.cardFingerprint());
        if (declineCode.isPresent()) {
            return new AuthorizationResult(AuthorizationResult.Type.DECLINED, null, declineCode.get());
        }
        return new AuthorizationResult(AuthorizationResult.Type.SUCCEEDED, "MOCK-AUTH-" + command.paymentId(), null);
    }
}
