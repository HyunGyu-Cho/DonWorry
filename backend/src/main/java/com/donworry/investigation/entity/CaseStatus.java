package com.donworry.investigation.entity;

// Case 상태 (fds 정본 03 §3.3 ③)
public enum CaseStatus {
    OPEN,
    INVESTIGATING,
    DECISION_PENDING,
    // 권고 반대 판정이 보안 관리자 승인을 기다림 (#102). 결제는 그대로, 새 결제는 이 사건에 묶지 않는다
    APPROVAL_PENDING,
    ACTION_PENDING,
    ACTION_FAILED,
    CLOSED
}
