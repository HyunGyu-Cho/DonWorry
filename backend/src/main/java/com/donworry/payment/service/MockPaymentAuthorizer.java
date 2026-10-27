package com.donworry.payment.service;

import org.springframework.stereotype.Component;

@Component
class MockPaymentAuthorizer implements PaymentAuthorizer {
    @Override
    public AuthorizationResult authorize(AuthorizationCommand command) {
        if (command == null) {
            throw new IllegalArgumentException("command must not be null");
        }
        // 시연 한도 초과 카드는 카드사가 거절한다 (#82)
        if (DemoCard.declines(command.cardFingerprint())) {
            return new AuthorizationResult(AuthorizationResult.Type.DECLINED, null, "LIMIT_EXCEEDED");
        }
        return new AuthorizationResult(AuthorizationResult.Type.SUCCEEDED, "MOCK-AUTH-" + command.paymentId(), null);
    }
}
