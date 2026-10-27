package com.donworry.investigation.service;

import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.util.Optional;

// 화면에 보일 사건 대상 이름 · 묶은 기준 문장 (#82) — 내부 번호 · 고객 코드는 쓰지 않는다
final class CaseLabels {

    private CaseLabels() {}

    static String subject(CaseType caseType, Optional<PaymentInfo> firstPayment) {
        if (caseType != CaseType.PAYMENT_FRAUD) {
            return "직원 계정";
        }
        return firstPayment
                .map(PaymentInfo::buyerName)
                .filter(name -> !name.isBlank())
                .map(name -> name + " 고객")
                .orElse("고객");
    }

    static String groupingBasis(CaseType caseType) {
        return caseType == CaseType.PAYMENT_FRAUD ? "같은 고객의 30분 안 매입 보류 결제" : "같은 직원 계정의 경보";
    }

    // 경보 목록의 고객 이름
    static String customer(Optional<PaymentInfo> payment) {
        return payment.map(PaymentInfo::buyerName)
                .filter(name -> !name.isBlank())
                .orElse("고객");
    }
}
