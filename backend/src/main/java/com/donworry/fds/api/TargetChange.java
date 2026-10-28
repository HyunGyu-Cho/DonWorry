package com.donworry.fds.api;

// 관리자 승인 뒤 반영 결과 (#104 2-7) — CHANGED 바꿈 · ALREADY_DONE 이미 그 상태 · UNAVAILABLE 대상이 없거나 바꿀 수 없음
public enum TargetChange {
    CHANGED,
    ALREADY_DONE,
    UNAVAILABLE
}
