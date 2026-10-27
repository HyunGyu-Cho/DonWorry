package com.donworry.payment.api;

import java.util.UUID;

// 직원 판정에 따른 결제 조치 공개 경계 (#82) — investigation이 판정 커밋 뒤에 부른다
// actionType: VOID(승인 취소) / CAPTURE(매입 진행). 같은 멱등키 · 같은 결제로 다시 불러도 한 번만 반영된다
public interface PaymentActions {

    Result request(Long paymentId, String actionType, UUID idempotencyKey);

    // accepted면 결제에 반영됨(operationId = 결제 쪽 작업 번호), 아니면 errorCode
    record Result(boolean accepted, Long operationId, String errorCode) {}
}
